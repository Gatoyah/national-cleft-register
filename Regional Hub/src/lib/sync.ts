/**
 * Offline-first sync engine: Regional Hub  <->  Main Hub.
 *
 * - Every patient / surgery saved here is written to the local (encrypted)
 *   database AND a row in sync_queue in the same request. Nothing depends on
 *   the internet to save data.
 * - runSync() pushes the queue to the Main Hub, then pulls back NCR IDs, status
 *   changes and surgeries recorded at the Main Hub for this hub's patients.
 * - It runs automatically every SYNC_INTERVAL_MINUTES (default 5) and a few
 *   seconds after new data is saved, and can be run manually from the Sync page.
 * - A record leaves the queue ONLY when the Main Hub confirms it saved that
 *   exact record. Network errors, Main Hub downtime and "patient not synced
 *   yet" are retried forever, so offline data is kept until it gets through.
 *   Records the Main Hub permanently rejects (invalid data) are marked
 *   "failed" with the reason, shown on the Sync page, and can be retried.
 */
import { db, client, syncQueue, patients, diagnoses, surgeries, facilityConfig } from "@/db";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

const BATCH = 100;
const REQUEST_TIMEOUT_MS = 30_000;

export type SyncResult = {
  ok: boolean;
  skipped?: string;
  error?: string;
  pushed: { patients: number; surgeries: number };
  failed: { patients: number; surgeries: number };
  waiting: number; // still pending (e.g. retry later)
  pulled: { patients: number; surgeries: number };
  durationMs: number;
};

// ----------------------------------------------------------------------------
// URL safety: the API key must not travel in clear text over the internet.
// ----------------------------------------------------------------------------

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h === "::1") return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/** Returns an error message if this Main Hub URL is not safe to send the API key to. */
export function checkMainHubUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Main Hub URL is not a valid URL";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "Main Hub URL must start with https:// or http://";
  if (u.protocol === "http:" && !isPrivateHost(u.hostname) && process.env.ALLOW_INSECURE_SYNC !== "true") {
    return "Use https:// for a Main Hub on the internet (plain http is only allowed on a private hospital network/VPN). Patient data and the API key must be encrypted in transit.";
  }
  return null;
}

// ----------------------------------------------------------------------------
// HTTP helper
// ----------------------------------------------------------------------------

class HubError extends Error {
  constructor(message: string, public status: number, public permanent = false) {
    super(message);
  }
}

async function callHub(baseUrl: string, apiKey: string, path: string, init: { method: string; body?: unknown }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } })?.cause?.code;
    throw new HubError(`Main Hub not reachable (${cause || (e as Error).name || "network error"}). Data is kept and will be sent when the connection returns.`, 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new HubError(`Main Hub rejected this hub's credentials: ${data.error || res.statusText}`, res.status, true);
  }
  if (!res.ok) {
    throw new HubError(`Main Hub error ${res.status}: ${data.error || res.statusText}`, res.status, res.status === 400);
  }
  return data;
}

// ----------------------------------------------------------------------------
// Payload builders (built fresh from the current row, so edits are included)
// ----------------------------------------------------------------------------

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

async function buildPatientPayloads(localIds: string[]) {
  const rows = await db.select().from(patients).where(inArray(patients.localId, localIds));
  const dx = rows.length ? await db.select().from(diagnoses).where(inArray(diagnoses.patientId, rows.map((r) => r.id))) : [];
  return rows.map((p) => ({
    localId: p.localId,
    ncrId: p.ncrId,
    firstName: p.firstName,
    middleName: p.middleName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth,
    sex: p.sex,
    placeOfBirth: p.placeOfBirth,
    regionOfResidence: p.regionOfResidence,
    districtOfResidence: p.districtOfResidence,
    townVillage: p.townVillage,
    gpsLatitude: num(p.gpsLatitude),
    gpsLongitude: num(p.gpsLongitude),
    caregiverName: p.caregiverName,
    caregiverRelationship: p.caregiverRelationship,
    caregiverPhone: p.caregiverPhone,
    caregiverPhone2: p.caregiverPhone2,
    isDeceased: !!p.isDeceased,
    deceasedDate: p.deceasedDate,
    consentClinicalCare: !!p.consentClinicalCare,
    consentResearch: !!p.consentResearch,
    consentDataSharing: !!p.consentDataSharing,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
    diagnoses: dx
      .filter((d) => d.patientId === p.id)
      .map((d) => ({
        localId: d.localId,
        diagnosisDate: d.diagnosisDate,
        cleftType: d.cleftType,
        diagnosedAntenatally: !!d.diagnosedAntenatally,
        diagnosedAtBirth: !!d.diagnosedAtBirth,
        lipInvolved: d.lipInvolved,
        lipLaterality: d.lipLaterality,
        lipComplete: d.lipComplete,
        alveolarInvolved: !!d.alveolarInvolved,
        palateInvolved: d.palateInvolved,
        palateType: d.palateType,
        lahsalCode: d.lahsalCode,
        hasAssociatedAnomalies: !!d.hasAssociatedAnomalies,
        associatedAnomaliesDetails: d.associatedAnomaliesDetails,
      })),
  }));
}

async function buildSurgeryPayloads(localIds: string[]) {
  const rows = await db
    .select({ s: surgeries, patientLocalId: patients.localId, patientNcrId: patients.ncrId })
    .from(surgeries)
    .innerJoin(patients, eq(surgeries.patientId, patients.id))
    .where(inArray(surgeries.localId, localIds));
  return rows.map(({ s, patientLocalId, patientNcrId }) => ({
    localId: s.localId,
    patientLocalId,
    patientNcrId,
    surgeryDate: s.surgeryDate,
    surgeryType: s.surgeryType,
    isPrimarySurgery: s.isPrimarySurgery,
    procedureDescription: s.procedureDescription,
    surgeonName: s.surgeonName,
    durationMinutes: s.durationMinutes,
    complications: !!s.complications,
    complicationsDetails: s.complicationsDetails,
    dischargeDate: s.dischargeDate || null,
    dischargeCondition: s.dischargeCondition,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  }));
}

// ----------------------------------------------------------------------------
// Queue
// ----------------------------------------------------------------------------

/** Queue a record for upload (one queue row per record; re-queuing is a no-op). */
export async function enqueue(tableName: "patients" | "surgeries", recordLocalId: string, operation: "create" | "update" = "create") {
  const [existing] = await db
    .select({ id: syncQueue.id })
    .from(syncQueue)
    .where(and(eq(syncQueue.tableName, tableName), eq(syncQueue.recordLocalId, recordLocalId)))
    .limit(1);
  if (existing) {
    await db.update(syncQueue).set({ status: "pending", lastError: null }).where(eq(syncQueue.id, existing.id));
  } else {
    await db.insert(syncQueue).values({ tableName, recordLocalId, operation, payload: {}, priority: tableName === "patients" ? 0 : 1, status: "pending" });
  }
}

type ItemResult = { localId: string; status: string; ncrId?: string; error?: string; retryable?: boolean };

async function pushTable(baseUrl: string, apiKey: string, facilityCode: string, table: "patients" | "surgeries", result: SyncResult) {
  // Loop in batches until the queue for this table is drained (or an error stops us).
  const attempted: number[] = [];
  for (let round = 0; round < 50; round++) {
    const queued = await db
      .select()
      .from(syncQueue)
      .where(and(eq(syncQueue.tableName, table), eq(syncQueue.status, "pending"), attempted.length ? notInArray(syncQueue.id, attempted) : undefined))
      .orderBy(syncQueue.createdAt)
      .limit(BATCH);
    if (!queued.length) return;
    attempted.push(...queued.map((q) => q.id));

    const localIds = queued.map((q) => q.recordLocalId);
    const payload = table === "patients" ? await buildPatientPayloads(localIds) : await buildSurgeryPayloads(localIds);

    // Queue rows whose record no longer exists: drop them.
    const present = new Set(payload.map((p) => p.localId));
    for (const q of queued) if (!present.has(q.recordLocalId)) await db.delete(syncQueue).where(eq(syncQueue.id, q.id));
    if (!payload.length) continue;

    const now = new Date();
    await db
      .update(syncQueue)
      .set({ lastAttemptAt: now })
      .where(inArray(syncQueue.id, queued.map((q) => q.id)));

    let data: { results?: { items?: ItemResult[] } };
    try {
      data = await callHub(baseUrl, apiKey, `/api/sync/${table}`, { method: "POST", body: { facilityCode, [table]: payload } });
    } catch (e) {
      for (const q of queued) {
        await db.update(syncQueue).set({ attempts: (q.attempts ?? 0) + 1, lastError: (e as Error).message }).where(eq(syncQueue.id, q.id));
      }
      throw e;
    }

    const items = new Map((data.results?.items ?? []).map((i) => [i.localId, i]));
    for (const q of queued) {
      const item = items.get(q.recordLocalId);
      const target = table === "patients" ? patients : surgeries;
      if (item && item.status !== "error") {
        // Confirmed saved by the Main Hub -> safe to remove from the queue.
        await db.delete(syncQueue).where(eq(syncQueue.id, q.id));
        await db
          .update(target)
          .set({ syncStatus: "synced", syncedAt: now, syncError: null, ...(table === "patients" && item.ncrId ? { ncrId: item.ncrId } : {}) })
          .where(eq(target.localId, q.recordLocalId));
        result.pushed[table]++;
      } else if (item?.retryable || !item) {
        // e.g. surgery whose patient is not on the Main Hub yet — try again next run.
        await db.update(syncQueue).set({ attempts: (q.attempts ?? 0) + 1, lastError: item?.error ?? "No confirmation from Main Hub" }).where(eq(syncQueue.id, q.id));
        result.waiting++;
      } else {
        await db.update(syncQueue).set({ status: "failed", attempts: (q.attempts ?? 0) + 1, lastError: item.error ?? "Rejected" }).where(eq(syncQueue.id, q.id));
        await db.update(target).set({ syncStatus: "failed", syncError: item.error ?? "Rejected" }).where(eq(target.localId, q.recordLocalId));
        result.failed[table]++;
      }
    }
  }
}

type PullData = {
  serverTime: string;
  data: {
    patients: { localId: string; ncrId: string; isDeceased: boolean | null; deceasedDate: string | null; isLostToFollowUp: boolean | null }[];
    surgeries: {
      remoteId: string; patientLocalId: string | null; surgeryDate: string; surgeryType: string; isPrimarySurgery: boolean | null;
      procedureDescription: string | null; surgeonName: string | null; durationMinutes: number | null; complications: boolean | null;
      complicationsDetails: string | null; dischargeDate: string | null; dischargeCondition: string | null;
    }[];
  };
};

async function pull(baseUrl: string, apiKey: string, since: Date | null, result: SyncResult): Promise<Date> {
  // Overlap by a minute: Main Hub timestamps have 1-second resolution, and
  // applying the same change twice is harmless.
  const qs = since ? `?since=${encodeURIComponent(new Date(since.getTime() - 60_000).toISOString())}` : "";
  const data = (await callHub(baseUrl, apiKey, `/api/sync/pull${qs}`, { method: "GET" })) as PullData;

  for (const p of data.data?.patients ?? []) {
    const [local] = await db.select({ id: patients.id, ncrId: patients.ncrId }).from(patients).where(eq(patients.localId, p.localId)).limit(1);
    if (!local) continue;
    await db
      .update(patients)
      .set({
        ncrId: p.ncrId,
        ...(p.isDeceased ? { isDeceased: true, deceasedDate: p.deceasedDate } : {}),
        ...(p.isLostToFollowUp != null ? { isLostToFollowUp: p.isLostToFollowUp } : {}),
      })
      .where(eq(patients.id, local.id));
    result.pulled.patients++;
  }

  for (const s of data.data?.surgeries ?? []) {
    if (!s.patientLocalId) continue;
    const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.localId, s.patientLocalId)).limit(1);
    if (!patient) continue;
    const values = {
      patientId: patient.id,
      surgeryDate: s.surgeryDate,
      surgeryType: s.surgeryType,
      isPrimarySurgery: s.isPrimarySurgery ?? true,
      procedureDescription: s.procedureDescription,
      surgeonName: s.surgeonName,
      durationMinutes: s.durationMinutes,
      complications: !!s.complications,
      complicationsDetails: s.complicationsDetails,
      dischargeDate: s.dischargeDate,
      dischargeCondition: s.dischargeCondition,
      origin: "main_hub",
      syncStatus: "synced",
      syncedAt: new Date(),
      updatedAt: new Date(),
    };
    await db
      .insert(surgeries)
      .values({ ...values, localId: s.remoteId })
      .onConflictDoUpdate({ target: surgeries.localId, set: values });
    result.pulled.surgeries++;
  }

  const serverTime = new Date(data.serverTime);
  return Number.isNaN(serverTime.getTime()) ? new Date() : serverTime;
}

// ----------------------------------------------------------------------------
// Orchestration
// ----------------------------------------------------------------------------

const g = globalThis as typeof globalThis & { __ncrSyncRunning?: Promise<SyncResult>; __ncrSyncTimer?: NodeJS.Timeout; __ncrSyncSoon?: NodeJS.Timeout };

export async function runSync(trigger: "manual" | "auto" | "after-save", userId: number | null = null): Promise<SyncResult> {
  // One sync at a time; concurrent callers share the running one.
  if (g.__ncrSyncRunning) return g.__ncrSyncRunning;
  g.__ncrSyncRunning = doSync(trigger, userId).finally(() => {
    g.__ncrSyncRunning = undefined;
  });
  return g.__ncrSyncRunning;
}

async function doSync(trigger: string, userId: number | null): Promise<SyncResult> {
  const started = Date.now();
  const result: SyncResult = {
    ok: false,
    pushed: { patients: 0, surgeries: 0 },
    failed: { patients: 0, surgeries: 0 },
    waiting: 0,
    pulled: { patients: 0, surgeries: 0 },
    durationMs: 0,
  };

  const [config] = await db.select().from(facilityConfig).limit(1);
  if (!config || !config.mainHubUrl || !config.apiKey) {
    result.skipped = "Sync is not configured yet (Main Hub URL and API key).";
    result.durationMs = Date.now() - started;
    return result;
  }
  if (config.syncEnabled === false && trigger !== "manual") {
    result.skipped = "Automatic sync is turned off.";
    result.durationMs = Date.now() - started;
    return result;
  }

  try {
    const urlError = checkMainHubUrl(config.mainHubUrl);
    if (urlError) throw new HubError(urlError, 0, true);
    const apiKey = decrypt(config.apiKey);

    // Patients first, so surgeries can be linked to them on the Main Hub.
    await pushTable(config.mainHubUrl, apiKey, config.facilityCode, "patients", result);
    await pushTable(config.mainHubUrl, apiKey, config.facilityCode, "surgeries", result);
    const serverTime = await pull(config.mainHubUrl, apiKey, config.lastPullAt, result);

    await db
      .update(facilityConfig)
      .set({ lastSyncAt: new Date(), lastPullAt: serverTime, lastSyncError: null })
      .where(eq(facilityConfig.id, config.id));
    result.ok = true;
  } catch (e) {
    result.error = (e as Error).message;
    await db.update(facilityConfig).set({ lastSyncError: result.error }).where(eq(facilityConfig.id, config.id));
  }

  result.durationMs = Date.now() - started;
  const didSomething = result.pushed.patients + result.pushed.surgeries + result.failed.patients + result.failed.surgeries + result.pulled.patients + result.pulled.surgeries > 0;
  if (trigger === "manual" || didSomething || result.error) {
    await logAudit({ userId, action: `sync_${trigger}`, tableName: "sync_queue", newValues: result as unknown as Record<string, unknown> });
  }
  return result;
}

/** Run a sync a few seconds after new data is saved (debounced). */
export function syncSoon() {
  if (g.__ncrSyncSoon) clearTimeout(g.__ncrSyncSoon);
  g.__ncrSyncSoon = setTimeout(() => {
    runSync("after-save").catch((e) => console.error("[sync] failed:", e));
  }, 5_000);
  g.__ncrSyncSoon.unref?.();
}

/** Background sync loop, started once when the server boots. */
export function startAutoSync() {
  if (g.__ncrSyncTimer || process.env.DISABLE_AUTO_SYNC === "true") return;
  const minutes = Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES) || 5);
  g.__ncrSyncTimer = setInterval(() => {
    runSync("auto")
      .then((r) => {
        if (r.error) console.warn(`[sync] ${r.error}`);
        else if (!r.skipped) console.log(`[sync] ok: pushed ${r.pushed.patients}p/${r.pushed.surgeries}s, pulled ${r.pulled.patients}p/${r.pulled.surgeries}s`);
      })
      .catch((e) => console.error("[sync] failed:", e));
  }, minutes * 60 * 1000);
  g.__ncrSyncTimer.unref?.();
  console.log(`[sync] automatic sync every ${minutes} minute(s)`);
}

/** Admin action: put permanently failed records back in the queue. */
export async function retryFailed(): Promise<number> {
  const failed = await db.select({ id: syncQueue.id }).from(syncQueue).where(eq(syncQueue.status, "failed"));
  if (failed.length) {
    await db.update(syncQueue).set({ status: "pending", lastError: null }).where(eq(syncQueue.status, "failed"));
    await client.execute("UPDATE patients SET sync_status = 'pending' WHERE sync_status = 'failed'");
    await client.execute("UPDATE surgeries SET sync_status = 'pending' WHERE sync_status = 'failed'");
  }
  return failed.length;
}

/** Quick connectivity + credentials check used when saving the config. */
export async function testConnection(mainHubUrl: string, apiKey: string): Promise<{ ok: boolean; reachable: boolean; error?: string; facility?: { code: string; name: string } }> {
  try {
    const data = await callHub(mainHubUrl, apiKey, `/api/sync/pull?since=${encodeURIComponent(new Date().toISOString())}`, { method: "GET" });
    return { ok: true, reachable: true, facility: data.facility };
  } catch (e) {
    const err = e as HubError;
    return { ok: false, reachable: err.status !== 0, error: err.message };
  }
}

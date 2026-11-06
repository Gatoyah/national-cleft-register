import { NextRequest, NextResponse } from "next/server";
import { db, surgeries, patients } from "@/db";
import { and, eq } from "drizzle-orm";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { authenticateSync, MAX_BATCH } from "@/lib/sync-auth";
import { apiError, isoDate } from "@/lib/api";
import { z } from "zod";

const text = (max = 255) => z.string().max(max).nullable().optional();

const surgerySchema = z.object({
  localId: z.string().min(1).max(64),
  patientNcrId: text(20),
  patientLocalId: text(64),
  surgeryDate: isoDate,
  surgeryType: z.enum([
    "primary_lip_repair", "primary_palate_repair", "secondary_lip_revision",
    "alveolar_bone_graft", "pharyngoplasty", "fistula_repair", "rhinoplasty", "other",
  ]),
  isPrimarySurgery: z.boolean().nullable().optional(),
  procedureDescription: text(5000),
  lipTechnique: z.enum(["millard", "tennison_randall", "fisher", "mohler", "other"]).nullable().optional(),
  palateTechnique: z.enum(["bardach", "furlow", "von_langenbeck", "veau_wardill_kilner", "intravelar_veloplasty", "other"]).nullable().optional(),
  surgeonName: text(),
  durationMinutes: z.number().int().min(0).max(2000).nullable().optional(),
  complications: z.boolean().nullable().optional(),
  complicationsDetails: text(5000),
  dischargeDate: z.union([isoDate, z.literal("")]).nullable().optional(),
  dischargeCondition: text(50),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const envelope = z.object({
  facilityCode: z.string().max(20).optional(),
  facilityApiKey: z.string().optional(),
  surgeries: z.array(z.unknown()).max(MAX_BATCH),
});

type ItemResult = { localId: string; status: "created" | "updated" | "error"; id?: number; error?: string; retryable?: boolean };

/** POST /api/sync/surgeries — idempotent per (facility, localId). */
export async function POST(request: NextRequest) {
  try {
    const body = envelope.parse(await request.json());
    const facility = await authenticateSync(request, body);
    if (facility instanceof NextResponse) return facility;

    const items: ItemResult[] = [];
    let created = 0, updated = 0;

    for (const raw of body.surgeries) {
      const parsed = surgerySchema.safeParse(sanitizeObject((raw ?? {}) as Record<string, unknown>));
      const localId = typeof (raw as { localId?: unknown })?.localId === "string" ? (raw as { localId: string }).localId : "?";
      if (!parsed.success) {
        items.push({ localId, status: "error", error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        continue;
      }
      const s = parsed.data;
      try {
        // Find the patient — only among patients this facility registered, or by NCR ID.
        let patientId: number | null = null;
        if (s.patientLocalId) {
          const [byLocal] = await db
            .select({ id: patients.id })
            .from(patients)
            .where(and(eq(patients.registeredAtFacilityId, facility.id), eq(patients.sourceLocalId, s.patientLocalId)))
            .limit(1);
          patientId = byLocal?.id ?? null;
        }
        if (!patientId && s.patientNcrId) {
          const [byNcr] = await db.select({ id: patients.id }).from(patients).where(eq(patients.ncrId, s.patientNcrId)).limit(1);
          patientId = byNcr?.id ?? null;
        }
        if (!patientId) {
          items.push({ localId: s.localId, status: "error", retryable: true, error: "Patient not synced yet (will retry after the patient syncs)" });
          continue;
        }

        const values = {
          patientId,
          surgeryDate: s.surgeryDate,
          surgeryType: s.surgeryType,
          isPrimarySurgery: s.isPrimarySurgery ?? true,
          procedureDescription: s.procedureDescription || null,
          lipTechnique: s.lipTechnique ?? null,
          palateTechnique: s.palateTechnique ?? null,
          surgeonName: s.surgeonName || null,
          durationMinutes: s.durationMinutes ?? null,
          intraopComplications: !!s.complications,
          intraopComplicationsDetails: s.complicationsDetails || null,
          dischargeDate: s.dischargeDate || null,
          dischargeCondition: s.dischargeCondition || null,
          facilityId: facility.id,
          sourceFacilityId: facility.id,
          sourceLocalId: s.localId,
          updatedAt: new Date(),
        };

        const [existing] = await db
          .select({ id: surgeries.id })
          .from(surgeries)
          .where(and(eq(surgeries.sourceFacilityId, facility.id), eq(surgeries.sourceLocalId, s.localId)))
          .limit(1);

        if (existing) {
          await db.update(surgeries).set(values).where(eq(surgeries.id, existing.id));
          items.push({ localId: s.localId, status: "updated", id: existing.id });
          updated++;
        } else {
          const createdAt = s.createdAt && !Number.isNaN(Date.parse(s.createdAt)) ? new Date(s.createdAt) : new Date();
          const [row] = await db.insert(surgeries).values({ ...values, createdAt }).returning({ id: surgeries.id });
          items.push({ localId: s.localId, status: "created", id: row.id });
          created++;
        }
      } catch (err) {
        console.error(`sync surgery ${s.localId} failed`, err);
        items.push({ localId: s.localId, status: "error", error: "Server could not save this record" });
      }
    }

    const errors = items.filter((i) => i.status === "error");
    await logAudit({ userId: null, action: "sync_surgeries", tableName: "surgeries", newValues: { facility: facility.code, received: body.surgeries.length, created, updated, errors: errors.length } });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: { received: body.surgeries.length, created, updated, errors: errors.map((e) => `${e.localId}: ${e.error}`), items },
    });
  } catch (error) {
    return apiError(error, "Sync failed");
  }
}

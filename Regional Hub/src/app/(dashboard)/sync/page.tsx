"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCsrf } from "@/hooks/useCsrf";
import { ErrorBox, describeApiError } from "@/components/AuthShell";

interface SyncStatusData {
  facility: {
    code: string;
    name: string;
    region: string;
    mainHubUrl: string | null;
    apiKeyConfigured: boolean;
    mainHubConfigured: boolean;
    urlWarning: string | null;
    syncEnabled: boolean | null;
    lastPullAt: string | null;
    autoSyncMinutes: number;
  } | null;
  stats: { pendingQueue: number; failedQueue: number; pendingPatients: number; totalPatients: number; totalSurgeries: number };
  lastSyncAt: string | null;
  lastSyncError: string | null;
  queue: { id: number; tableName: string; recordLocalId: string; status: string; attempts: number; lastError: string | null; lastAttemptAt: string | null }[];
}

interface SyncRunResult {
  ok: boolean;
  skipped?: string;
  error?: string;
  pushed: { patients: number; surgeries: number };
  failed: { patients: number; surgeries: number };
  waiting: number;
  pulled: { patients: number; surgeries: number };
}

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-GB") : "Never");

export default function SyncPage() {
  const { getCsrfHeaders } = useCsrf();
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<SyncRunResult | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<{ message: string; details: string[] }>({ message: "", details: [] });

  const load = useCallback(async () => {
    const res = await fetch("/api/sync/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    let active = true;
    const tick = () =>
      fetch("/api/sync/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => active && d && setStatus(d))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  async function post(url: string, body?: unknown, method = "POST") {
    setBusy(true);
    setError({ message: "", details: [] });
    setNotice("");
    try {
      const res = await fetch(url, { method, headers: getCsrfHeaders(), body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      await load();
      return { ok: res.ok, data };
    } catch {
      setError({ message: "Could not reach this hub's server", details: [] });
      return { ok: false, data: {} };
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    const { data } = await post("/api/sync/push");
    if (data && "pushed" in data) setResult(data as SyncRunResult);
    else if (data?.error) setError(describeApiError(data));
  }

  async function retry() {
    const { ok, data } = await post("/api/sync/retry");
    if (ok) setNotice(`${data.requeued} record(s) put back in the queue.`);
    else setError(describeApiError(data));
  }

  async function saveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { ok, data } = await post(
      "/api/sync/config",
      {
        facilityCode: f.get("facilityCode"),
        facilityName: f.get("facilityName"),
        mainHubUrl: f.get("mainHubUrl"),
        apiKey: f.get("apiKey") || undefined,
        syncEnabled: f.get("syncEnabled") === "on",
      },
      "PATCH"
    );
    if (ok) {
      setNotice(data.message);
      setEditing(false);
    } else setError(describeApiError(data));
  }

  const f = status?.facility;
  const waiting = (status?.stats.pendingQueue ?? 0) + (status?.stats.failedQueue ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sync with Main Hub</h1>
          <p className="text-gray-500 mt-1">
            Everything is saved on this hub first, so work continues without internet. Records are sent to the Main Hub
            automatically every {f?.autoSyncMinutes ?? 5} minutes whenever it can be reached.
          </p>
        </div>
        <div className="flex gap-2">
          {(status?.stats.failedQueue ?? 0) > 0 && (
            <Button variant="outline" onClick={retry} disabled={busy}>Retry failed</Button>
          )}
          <Button onClick={syncNow} isLoading={busy} disabled={!f?.mainHubConfigured}>Sync now</Button>
        </div>
      </div>

      <ErrorBox message={error.message} details={error.details} />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">{notice}</div>}
      {result && (
        <div className={`p-4 rounded-lg border text-sm ${result.ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
          {result.skipped ? (
            <p>{result.skipped}</p>
          ) : (
            <>
              <p className="font-medium">{result.ok ? "Sync completed." : "Sync could not finish."}</p>
              {result.error && <p>{result.error}</p>}
              <p>
                Sent {result.pushed.patients} patient(s) and {result.pushed.surgeries} surgery record(s). Received{" "}
                {result.pulled.patients} patient update(s) and {result.pulled.surgeries} surgery record(s).
                {result.waiting > 0 && ` ${result.waiting} record(s) will be retried.`}
                {result.failed.patients + result.failed.surgeries > 0 && ` ${result.failed.patients + result.failed.surgeries} record(s) were rejected — see below.`}
              </p>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent><p className="text-sm text-gray-500">Waiting to sync</p><p className={`text-2xl font-bold ${waiting ? "text-amber-600" : "text-emerald-600"}`}>{status?.stats.pendingQueue ?? "–"}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-gray-500">Rejected by Main Hub</p><p className={`text-2xl font-bold ${status?.stats.failedQueue ? "text-red-600" : ""}`}>{status?.stats.failedQueue ?? "–"}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-gray-500">Patients on this hub</p><p className="text-2xl font-bold">{status?.stats.totalPatients ?? "–"}</p></CardContent></Card>
        <Card><CardContent><p className="text-sm text-gray-500">Surgeries on this hub</p><p className="text-2xl font-bold">{status?.stats.totalSurgeries ?? "–"}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Last successful sync: {when(status?.lastSyncAt ?? null)}
            {status?.lastSyncError && <span className="block text-amber-700 mt-1">Last problem: {status.lastSyncError}</span>}
            {f?.urlWarning && <span className="block text-red-700 mt-1">{f.urlWarning}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500 w-40 inline-block">Hospital</span>{f?.name} ({f?.code})</p>
              <p><span className="text-gray-500 w-40 inline-block">Main Hub URL</span>{f?.mainHubUrl || <em className="text-amber-700">not set</em>}</p>
              <p><span className="text-gray-500 w-40 inline-block">API key</span>{f?.apiKeyConfigured ? "Saved (encrypted)" : <em className="text-amber-700">not set</em>}</p>
              <p><span className="text-gray-500 w-40 inline-block">Automatic sync</span>{f?.syncEnabled === false ? "Off" : `On, every ${f?.autoSyncMinutes ?? 5} min`}</p>
              <Button variant="outline" className="mt-3" onClick={() => setEditing(true)}>Edit connection</Button>
            </div>
          ) : (
            <form onSubmit={saveConfig} className="space-y-4 max-w-xl">
              <Input label="Hospital name" name="facilityName" defaultValue={f?.name} required />
              <Input label="Facility code" name="facilityCode" defaultValue={f?.code} required hint="Exactly as registered on the Main Hub (Regional Hubs page)." />
              <Input label="Main Hub URL" name="mainHubUrl" defaultValue={f?.mainHubUrl ?? ""} required placeholder="https://ncr-main.example.gov.gh" hint="Use https:// over the internet. http:// is only allowed on a private network or VPN." />
              <Input label="API key" name="apiKey" type="password" autoComplete="off" placeholder={f?.apiKeyConfigured ? "Leave empty to keep the saved key" : "ncr_..."} hint="Shown once on the Main Hub when the hub was registered (or a new key was issued)." />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="syncEnabled" defaultChecked={f?.syncEnabled !== false} className="w-4 h-4" />
                Sync automatically in the background
              </label>
              <div className="flex gap-2">
                <Button type="submit" isLoading={busy}>Save and test</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {status && status.queue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Records with sync problems</CardTitle>
            <CardDescription>&quot;Pending&quot; records are retried automatically. &quot;Failed&quot; records were rejected by the Main Hub; fix the data, then press &quot;Retry failed&quot;.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 px-4">Type</th><th className="py-2 px-4">Record</th><th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4">Attempts</th><th className="py-2 px-4">Reason</th>
                </tr>
              </thead>
              <tbody>
                {status.queue.map((q) => (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="py-2 px-4 capitalize">{q.tableName}</td>
                    <td className="py-2 px-4 font-mono text-xs">{q.recordLocalId.slice(0, 8)}</td>
                    <td className={`py-2 px-4 ${q.status === "failed" ? "text-red-600" : "text-amber-700"}`}>{q.status}</td>
                    <td className="py-2 px-4">{q.attempts}</td>
                    <td className="py-2 px-4 text-xs">{q.lastError}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

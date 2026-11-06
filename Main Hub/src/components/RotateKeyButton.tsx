"use client";

import { useState } from "react";
import { useCsrf } from "@/hooks/useCsrf";

/** Revokes a hub's sync key and shows the replacement once. */
export function RotateKeyButton({ hubId, code }: { hubId: number; code: string }) {
  const { getCsrfHeaders } = useCsrf();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  async function rotate() {
    if (!confirm(`Issue a new sync key for ${code}? The old key stops working immediately; you must paste the new one into that Regional Hub's Sync page.`)) return;
    setError("");
    const res = await fetch(`/api/hubs/${hubId}/rotate-key`, { method: "POST", headers: getCsrfHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Failed");
    else setKey(data.apiKey);
  }

  if (key)
    return (
      <div className="text-xs max-w-xs">
        <p className="font-medium text-amber-800">New key (shown once):</p>
        <code className="block break-all bg-amber-50 border border-amber-200 rounded p-1 select-all">{key}</code>
      </div>
    );
  return (
    <span>
      <button type="button" onClick={rotate} className="text-emerald-600 hover:underline text-sm">New sync key</button>
      {error && <span className="text-red-600 text-xs ml-2">{error}</span>}
    </span>
  );
}

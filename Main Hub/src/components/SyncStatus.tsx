"use client";

import { useState, useEffect } from "react";

export function SyncStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check for pending sync items from localStorage
    const checkPending = () => {
      try {
        const pending = localStorage.getItem("ncr_pending_sync");
        if (pending) {
          const items = JSON.parse(pending);
          setPendingSync(Array.isArray(items) ? items.length : 0);
        }
        const last = localStorage.getItem("ncr_last_sync");
        if (last) {
          setLastSync(new Date(last));
        }
      } catch {
        // Ignore errors
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
      {/* Online/Offline indicator */}
      <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className="text-xs font-medium text-gray-600">
        {isOnline ? "Online" : "Offline"}
      </span>

      {/* Pending sync count */}
      {pendingSync > 0 && (
        <span className="text-xs text-amber-600 font-medium">
          ({pendingSync} pending)
        </span>
      )}

      {/* Last sync time */}
      {lastSync && isOnline && pendingSync === 0 && (
        <span className="text-xs text-gray-400">
          Last sync: {formatTimeAgo(lastSync)}
        </span>
      )}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

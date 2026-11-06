"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface HeaderProps {
  user?: { firstName: string; lastName: string; role: string } | null;
  canSearchPatients?: boolean;
  canRegister?: boolean;
}

type SyncSummary = { stats: { pendingQueue: number; failedQueue: number }; lastSyncAt: string | null; lastSyncError: string | null };

export function Header({ user, canRegister }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sync, setSync] = useState<SyncSummary | null>(null);

  // Show whether data saved here has reached the Main Hub yet.
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/sync/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => active && d && setSync(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const waiting = sync ? sync.stats.pendingQueue + sync.stats.failedQueue : 0;
  const badge = !sync
    ? { cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400", text: "Checking sync…" }
    : waiting === 0
      ? { cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", text: "All records synced" }
      : { cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500", text: `${waiting} record${waiting === 1 ? "" : "s"} saved here, waiting to sync` };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${badge.cls}`}
          title={sync?.lastSyncError || (sync?.lastSyncAt ? `Last sync ${new Date(sync.lastSyncAt).toLocaleString()}` : "Not synced yet")}
        >
          <div className={`w-2 h-2 rounded-full ${badge.dot}`} />
          {badge.text}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {canRegister && (
          <Link href="/patients/new">
            <Button size="sm">Register Birth</Button>
          </Link>
        )}

        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100">
            <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">{user ? `${user.firstName[0]}${user.lastName[0]}` : "U"}</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">{user ? `${user.firstName} ${user.lastName}` : "User"}</p>
              <p className="text-xs text-gray-500 capitalize">{(user?.role || "user").replace(/_/g, " ")}</p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <Link href="/account" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                My Account / Change Password
              </Link>
              <hr className="my-1" />
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100">
                  Sign Out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

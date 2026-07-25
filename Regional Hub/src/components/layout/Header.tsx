"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface HeaderProps {
  user?: {
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}

export function Header({ user }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
          {isOnline ? "Online" : "Offline"}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link href="/patients/new">
          <Button size="sm">Register Birth</Button>
        </Link>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100"
          >
            <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user ? `${user.firstName[0]}${user.lastName[0]}` : "U"}
              </span>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">
                {user ? `${user.firstName} ${user.lastName}` : "User"}
              </p>
              <p className="text-xs text-gray-500 capitalize">{user?.role || "User"}</p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                >
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

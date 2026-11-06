"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { ErrorBox, PASSWORD_HINT, describeApiError } from "@/components/AuthShell";
import { useCsrf } from "@/hooks/useCsrf";

export function ChangePasswordForm({ name, email, role, mustChange }: { name: string; email: string; role: string; mustChange: boolean }) {
  const router = useRouter();
  const { getCsrfHeaders } = useCsrf();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] }>({ message: "", details: [] });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) {
      setError({ message: "New passwords do not match", details: [] });
      return;
    }
    setLoading(true);
    setError({ message: "", details: [] });
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: getCsrfHeaders(),
        body: JSON.stringify({ currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(describeApiError(data));
        return;
      }
      form.reset();
      setDone(true);
      if (mustChange) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError({ message: "Could not reach the server", details: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mustChange ? "Choose your own password" : "My account"}</CardTitle>
        <CardDescription>
          {name} · {email} · <span className="capitalize">{role.replace(/_/g, " ")}</span>
          {mustChange && (
            <span className="block mt-2 text-amber-700">
              Your account was created (or reset) by an administrator. Please set a new password before continuing.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ErrorBox message={error.message} details={error.details} />
        {done && !mustChange && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
            Password changed. Other devices signed in to this account have been signed out.
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <Input label={mustChange ? "Temporary password" : "Current password"} name="currentPassword" type="password" required autoComplete="current-password" />
          <Input label="New password" name="newPassword" type="password" required autoComplete="new-password" hint={PASSWORD_HINT} />
          <Input label="Confirm new password" name="confirm" type="password" required autoComplete="new-password" />
          <Button type="submit" className="w-full" isLoading={loading}>
            Change password
          </Button>
        </form>
        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between text-sm">
          {!mustChange ? <Link href="/dashboard" className="text-emerald-700 hover:underline">← Back to dashboard</Link> : <span />}
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-red-600 hover:underline">Sign out</button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

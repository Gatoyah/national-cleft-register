"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { useCsrf } from "@/hooks/useCsrf";
import { ErrorBox, describeApiError } from "@/components/AuthShell";
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { getUserRoleLabel } from "@/lib/utils";

type EditableUser = {
  id: number; email: string; firstName: string; lastName: string; role: string;
  facilityId: number | null; phone: string | null; isActive: boolean | null;
  isLocked: boolean; mustChangePassword: boolean | null; lastLoginAt: string | null;
};

export function EditUserForm({ user, facilities, isSelf }: { user: EditableUser; facilities: { id: number; name: string; code: string }[]; isSelf: boolean }) {
  const router = useRouter();
  const { getCsrfHeaders } = useCsrf();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [error, setError] = useState<{ message: string; details: string[] }>({ message: "", details: [] });

  async function patch(body: Record<string, unknown>, success: string) {
    setLoading(true);
    setError({ message: "", details: [] });
    setNotice("");
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: getCsrfHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setError(describeApiError(data));
        return;
      }
      if (data.temporaryPassword) setTempPassword(data.temporaryPassword);
      setNotice(success);
      router.refresh();
    } catch {
      setError({ message: "Could not reach the server", details: [] });
    } finally {
      setLoading(false);
    }
  }

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    patch(
      {
        firstName: f.get("firstName"),
        lastName: f.get("lastName"),
        role: f.get("role"),
        phone: f.get("phone") || null,
        facilityId: f.get("facilityId") ? Number(f.get("facilityId")) : null,
      },
      "Changes saved."
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/users" className="text-sm text-emerald-700 hover:underline">← All users</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{user.firstName} {user.lastName}</h1>
        <p className="text-gray-500">{user.email} · last login {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "never"}</p>
      </div>

      <ErrorBox message={error.message} details={error.details} />
      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">{notice}</div>}
      {tempPassword && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm">
          New temporary password (shown once):{" "}
          <code className="px-2 py-1 bg-white border rounded font-mono select-all">{tempPassword}</code>
          <p className="mt-1">The user must choose a new password when they next sign in.</p>
        </div>
      )}

      <form onSubmit={onSave}>
        <Card>
          <CardHeader><CardTitle>Details and role</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" defaultValue={user.firstName} required />
              <Input label="Last Name" name="lastName" defaultValue={user.lastName} required />
            </div>
            <Select
              label="Role"
              name="role"
              defaultValue={user.role}
              disabled={isSelf}
              options={ROLES.map((r) => ({ value: r, label: `${getUserRoleLabel(r)} — ${ROLE_DESCRIPTIONS[r]}` }))}
            />
            {isSelf && <input type="hidden" name="role" value={user.role} />}
            <Select
              label="Facility"
              name="facilityId"
              defaultValue={user.facilityId ? String(user.facilityId) : ""}
              placeholder="No facility"
              options={facilities.map((f) => ({ value: String(f.id), label: `${f.name} (${f.code})` }))}
            />
            <Input label="Phone" name="phone" defaultValue={user.phone ?? ""} />
            <div className="flex justify-end"><Button type="submit" isLoading={loading}>Save changes</Button></div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Access</CardTitle>
          <CardDescription>
            Status: {user.isActive ? "Active" : "Disabled"}
            {user.isLocked && " · Locked after failed logins"}
            {user.mustChangePassword && " · Must change password at next login"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={loading} onClick={() => patch({ resetPassword: true }, "Password reset.")}>
            Reset password
          </Button>
          {user.isLocked && (
            <Button type="button" variant="outline" disabled={loading} onClick={() => patch({ unlock: true }, "Account unlocked.")}>
              Unlock account
            </Button>
          )}
          {!isSelf &&
            (user.isActive ? (
              <Button type="button" variant="danger" disabled={loading} onClick={() => confirm("Disable this account? The user will be signed out immediately.") && patch({ isActive: false }, "Account disabled.")}>
                Disable account
              </Button>
            ) : (
              <Button type="button" disabled={loading} onClick={() => patch({ isActive: true }, "Account re-enabled.")}>
                Re-enable account
              </Button>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

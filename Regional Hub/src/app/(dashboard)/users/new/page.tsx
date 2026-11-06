"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCsrf } from "@/hooks/useCsrf";
import { ErrorBox, PASSWORD_HINT, describeApiError } from "@/components/AuthShell";
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { getUserRoleLabel } from "@/lib/utils";

export default function NewUserPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] }>({ message: "", details: [] });
  const [created, setCreated] = useState<{ email: string; temporaryPassword?: string } | null>(null);
  const { getCsrfHeaders } = useCsrf();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError({ message: "", details: [] });
    const form = e.currentTarget;
    const data = Object.fromEntries(Array.from(new FormData(form).entries()).filter(([, v]) => v !== ""));
    try {
      const res = await fetch("/api/users", { method: "POST", headers: getCsrfHeaders(), body: JSON.stringify(data) });
      const body = await res.json();
      if (!res.ok) {
        setError(describeApiError(body));
        return;
      }
      setCreated({ email: body.email, temporaryPassword: body.temporaryPassword });
      form.reset();
    } catch {
      setError({ message: "Could not reach the server", details: [] });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New User</h1>
        <p className="text-gray-500 mt-1">Give a colleague their own account. Each role only sees what it needs.</p>
      </div>

      {created && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-sm space-y-1">
          <p className="font-medium">Account created for {created.email}.</p>
          {created.temporaryPassword ? (
            <p>
              Temporary password (shown only once — give it to the user privately):{" "}
              <code className="px-2 py-1 bg-white border rounded font-mono select-all">{created.temporaryPassword}</code>
            </p>
          ) : (
            <p>Give the user the password you chose.</p>
          )}
          <p>They will be asked to choose their own password the first time they sign in.</p>
          <p><Link href="/users" className="underline">Back to user list</Link></p>
        </div>
      )}

      <ErrorBox message={error.message} details={error.details} />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <Input label="Email Address" name="email" type="email" required hint="Used to sign in" />
            <Input
              label="Initial password (optional)"
              name="password"
              type="password"
              autoComplete="new-password"
              hint={`Leave empty to generate a strong temporary password. ${PASSWORD_HINT}`}
            />
            <Select
              label="Role"
              name="role"
              required
              placeholder="Select user role"
              options={ROLES.map((r) => ({ value: r, label: `${getUserRoleLabel(r)} — ${ROLE_DESCRIPTIONS[r]}` }))}
            />
            <Input label="Phone Number" name="phone" type="tel" />
            <Input label="Professional ID" name="professionalId" placeholder="Medical licence or staff ID" />
            <div className="flex justify-end gap-4 pt-4">
              <Link href="/users"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" isLoading={isLoading}>Create User</Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>What each role can do</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {ROLES.map((r) => (
              <div key={r} className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{getUserRoleLabel(r)}</p>
                <p className="text-gray-600">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

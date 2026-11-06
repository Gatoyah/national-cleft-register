"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { AuthShell, ErrorBox, PASSWORD_HINT, describeApiError } from "@/components/AuthShell";

/** First-run wizard: creates the hub's administrator account. */
export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; details: string[] }>({ message: "", details: [] });

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((d) => (d.needsSetup ? setChecking(false) : router.replace("/login")))
      .catch(() => setChecking(false));
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError({ message: "Passwords do not match", details: [] });
      return;
    }
    setLoading(true);
    setError({ message: "", details: [] });
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupToken: f.get("setupToken"),
          firstName: f.get("firstName"),
          lastName: f.get("lastName"),
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(describeApiError(data));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError({ message: "Could not reach the server", details: [] });
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <AuthShell><p className="text-center text-gray-500">Checking…</p></AuthShell>;

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>First-time setup</CardTitle>
          <CardDescription>
            Create the administrator account for this hub. The administrator has access to everything and creates
            accounts for everyone else.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorBox message={error.message} details={error.details} />
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Setup token"
              name="setupToken"
              required
              autoComplete="off"
              hint="Shown in the server window when the app started, and saved in setup-token.txt in the app folder."
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" name="firstName" required />
              <Input label="Last name" name="lastName" required />
            </div>
            <Input label="Email" name="email" type="email" required autoComplete="email" />
            <Input label="Password" name="password" type="password" required autoComplete="new-password" hint={PASSWORD_HINT} />
            <Input label="Confirm password" name="confirm" type="password" required autoComplete="new-password" />
            <Button type="submit" className="w-full" isLoading={loading}>
              Create administrator
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

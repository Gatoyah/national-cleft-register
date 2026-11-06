import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

export default function ForbiddenPage() {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Access not permitted</CardTitle>
          <CardDescription>
            Your account&apos;s role does not allow access to that page. If you need it for your work, ask your hub
            administrator to change your role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className="text-emerald-700 hover:underline">← Back to dashboard</Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mustChange?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { mustChange } = await searchParams;

  return (
    <AuthShell>
      <ChangePasswordForm
        name={`${user.firstName} ${user.lastName}`}
        email={user.email}
        role={user.role}
        mustChange={!!user.mustChangePassword || mustChange === "1"}
      />
    </AuthShell>
  );
}

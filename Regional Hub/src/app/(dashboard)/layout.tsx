import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { requirePageUser } from "@/lib/auth";
import { ROLE_PERMISSIONS, type Role } from "@/lib/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Redirects to /login (not signed in) or /account (must change password).
  const user = await requirePageUser();
  const permissions = ROLE_PERMISSIONS[user.role as Role] ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar permissions={permissions} />
      <div className="ml-64">
        <Header
          user={{ firstName: user.firstName, lastName: user.lastName, role: user.role }}
          canSearchPatients={permissions.includes("patients.view")}
          canRegister={permissions.includes("patients.create")}
        />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

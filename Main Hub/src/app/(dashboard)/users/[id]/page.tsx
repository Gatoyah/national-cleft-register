import { notFound } from "next/navigation";
import { db, users, facilities } from "@/db";
import { eq } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth";
import { EditUserForm } from "./EditUserForm";

export const dynamic = "force-dynamic";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePagePermission("users.manage");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [user] = await db
    .select({
      id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName,
      role: users.role, facilityId: users.facilityId, phone: users.phone, isActive: users.isActive,
      lockedUntil: users.lockedUntil, mustChangePassword: users.mustChangePassword, lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) notFound();

  const facilityList = await db.select({ id: facilities.id, name: facilities.name, code: facilities.code }).from(facilities);

  return (
    <EditUserForm
      user={{
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role,
        facilityId: user.facilityId, phone: user.phone, isActive: user.isActive, mustChangePassword: user.mustChangePassword,
        isLocked: !!user.lockedUntil && user.lockedUntil > new Date(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      }}
      facilities={facilityList}
      isSelf={me.id === user.id}
    />
  );
}

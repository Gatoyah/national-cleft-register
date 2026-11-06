import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import {
  requireAuth, checkCsrf, verifyPassword, hashPassword, validatePasswordStrength,
  getSession, destroyAllUserSessions,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth({ allowMustChangePassword: true });
    if (user instanceof NextResponse) return user;
    const csrfError = await checkCsrf(request);
    if (csrfError) return csrfError;

    const { currentPassword, newPassword } = schema.parse(await request.json());
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(currentPassword, row.passwordHash))) {
      await logAudit({ userId: user.id, action: "change_password_failed", tableName: "users", recordId: user.id });
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: "Password does not meet requirements", details: strength.errors }, { status: 400 });
    }
    if (await verifyPassword(newPassword, row.passwordHash)) {
      return NextResponse.json({ error: "New password must be different from the current one" }, { status: 400 });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Log out every other device using this account.
    const session = await getSession();
    await destroyAllUserSessions(user.id, session?.tokenHash);
    await logAudit({ userId: user.id, action: "change_password", tableName: "users", recordId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "Failed to change password");
  }
}

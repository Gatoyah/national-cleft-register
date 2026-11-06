import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { and, count, eq, ne } from "drizzle-orm";
import { requireMutation, hashPassword, generateRandomPassword, destroyAllUserSessions } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, parseId } from "@/lib/api";
import { ROLES } from "@/lib/permissions";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  phone: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
  resetPassword: z.boolean().optional(), // generate a new temporary password
  unlock: z.boolean().optional(),
});

/** PATCH /api/users/:id — admin edits another account. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const admin = await requireMutation(request, "users.manage");
    if (admin instanceof NextResponse) return admin;

    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });

    const data = updateSchema.parse(sanitizeObject(await request.json()));
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const removingAdmin =
      target.role === "admin" && ((data.role && data.role !== "admin") || data.isActive === false);
    if (target.id === admin.id && (removingAdmin || data.isActive === false)) {
      return NextResponse.json({ error: "You cannot disable or demote your own account." }, { status: 400 });
    }
    if (removingAdmin) {
      const [others] = await db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, target.id)));
      if ((others?.n ?? 0) === 0) {
        return NextResponse.json({ error: "There must always be at least one active administrator." }, { status: 400 });
      }
    }

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (data.firstName !== undefined) updates.firstName = data.firstName;
    if (data.lastName !== undefined) updates.lastName = data.lastName;
    if (data.role !== undefined) updates.role = data.role;
    if (data.phone !== undefined) updates.phone = data.phone || null;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.unlock) {
      updates.lockedUntil = null;
      updates.failedLoginAttempts = 0;
    }

    let temporaryPassword: string | undefined;
    if (data.resetPassword) {
      temporaryPassword = generateRandomPassword();
      updates.passwordHash = await hashPassword(temporaryPassword);
      updates.mustChangePassword = true;
      updates.lockedUntil = null;
      updates.failedLoginAttempts = 0;
    }

    await db.update(users).set(updates).where(eq(users.id, id));

    // Disabling an account, changing its role or resetting its password ends its sessions.
    if (data.isActive === false || data.resetPassword || (data.role && data.role !== target.role)) {
      await destroyAllUserSessions(id);
    }

    await logAudit({
      userId: admin.id,
      action: data.resetPassword ? "reset_user_password" : "update_user",
      tableName: "users",
      recordId: id,
      oldValues: { role: target.role, isActive: target.isActive },
      newValues: { ...data, resetPassword: !!data.resetPassword },
    });

    return NextResponse.json({ success: true, ...(temporaryPassword ? { temporaryPassword } : {}) });
  } catch (error) {
    return apiError(error, "Failed to update user");
  }
}

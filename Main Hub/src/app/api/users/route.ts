import { NextRequest, NextResponse } from "next/server";
import { db, users, facilities } from "@/db";
import { hashPassword, requirePermission, requireMutation, validatePasswordStrength, generateRandomPassword } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { ROLES } from "@/lib/permissions";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email").max(255),
  // Optional: if omitted a strong temporary password is generated and shown once.
  password: z.string().optional().or(z.literal("")),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  role: z.enum(ROLES),
  facilityId: z.coerce.number().int().positive().optional().nullable(),
  phone: z.string().max(20).optional(),
  professionalId: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireMutation(request, "users.manage");
    if (admin instanceof NextResponse) return admin;

    const body = await request.json();
    const { password, ...rest } = body ?? {};
    const data = createUserSchema.parse({ ...sanitizeObject(rest), password });

    const generated = !data.password;
    const initialPassword = data.password || generateRandomPassword();
    const strength = validatePasswordStrength(initialPassword);
    if (!strength.valid) {
      return NextResponse.json({ error: "Password does not meet complexity requirements", details: strength.errors }, { status: 400 });
    }

    if (data.facilityId) {
      const [f] = await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.id, data.facilityId)).limit(1);
      if (!f) return NextResponse.json({ error: "Facility not found" }, { status: 400 });
    }

    const [newUser] = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash: await hashPassword(initialPassword),
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        facilityId: data.facilityId || admin.facilityId || null,
        phone: data.phone || null,
        professionalId: data.professionalId || null,
        isActive: true,
        // The person must choose their own password at first login.
        mustChangePassword: true,
        createdByUserId: admin.id,
      })
      .returning({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, role: users.role });

    await logAudit({ userId: admin.id, action: "create_user", tableName: "users", recordId: newUser.id, newValues: { email: newUser.email, role: newUser.role } });

    return NextResponse.json(
      { ...newUser, ...(generated ? { temporaryPassword: initialPassword } : {}), mustChangePassword: true },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error, "Failed to create user");
  }
}

export async function GET() {
  try {
    const admin = await requirePermission("users.manage");
    if (admin instanceof NextResponse) return admin;

    const list = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        facilityId: users.facilityId,
        isActive: users.isActive,
        mustChangePassword: users.mustChangePassword,
        lockedUntil: users.lockedUntil,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return NextResponse.json(list);
  } catch (error) {
    return apiError(error, "Failed to fetch users");
  }
}

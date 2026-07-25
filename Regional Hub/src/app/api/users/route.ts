import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { hashPassword, getCurrentUser, canManageUsers } from "@/lib/auth";
import { logAudit, addSecurityHeaders, sanitizeObject } from "@/lib/security";
import { z } from "zod";
import { desc } from "drizzle-orm";

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(12).max(100), // Minimum 12 chars for security
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(["admin", "clinician", "surgeon", "data_clerk", "viewer"]),
  phone: z.string().max(20).optional(),
  professionalId: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !canManageUsers(currentUser.role)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      );
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createUserSchema.parse(sanitizedBody);

    // Hash password
    const passwordHash = await hashPassword(validatedData.password);

    const [newUser] = await db
      .insert(users)
      .values({
        email: validatedData.email.toLowerCase(),
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: validatedData.role,
        phone: validatedData.phone || null,
        professionalId: validatedData.professionalId || null,
        isActive: true,
        mustChangePassword: true, // Force password change
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      });

    await logAudit(currentUser.id, "create", "users", newUser.id, null, { email: newUser.email }, request);

    return addSecurityHeaders(
      NextResponse.json(newUser, { status: 201 })
    );
  } catch (error) {
    console.error("Error creating user:", error);

    if (error instanceof z.ZodError) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      );
    }

    if (error instanceof Error && error.message.includes("unique")) {
      return addSecurityHeaders(
        NextResponse.json({ error: "A user with this email already exists" }, { status: 409 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to create user" }, { status: 500 })
    );
  }
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !canManageUsers(currentUser.role)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      );
    }

    const userList = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return addSecurityHeaders(NextResponse.json(userList));
  } catch (error) {
    console.error("Error fetching users:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
    );
  }
}

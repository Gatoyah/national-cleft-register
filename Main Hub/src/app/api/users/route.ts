import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { hashPassword, requireRole, getSessionToken, validatePasswordStrength } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { validateCsrfToken } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { desc } from "drizzle-orm";

const createUserSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["admin", "clinician", "surgeon", "data_clerk", "researcher", "viewer", "community_health_worker"]),
  facilityId: z.coerce.number().optional(),
  phone: z.string().optional(),
  professionalId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const currentUser = await requireRole("admin");
    if (currentUser instanceof NextResponse) return currentUser;

    // Validate CSRF token
    const csrfToken = request.headers.get("x-csrf-token");
    const sessionToken = await getSessionToken();
    if (!csrfToken || !sessionToken || !validateCsrfToken(csrfToken, sessionToken)) {
      return NextResponse.json(
        { error: "Invalid or missing CSRF token" },
        { status: 403 }
      );
    }

    const body = await request.json();
    
    // Separate password from fields to avoid changing special characters during HTML escape sanitisation
    const { password, ...otherFields } = body;
    const sanitizedFields = sanitizeObject(otherFields);
    
    const validatedData = createUserSchema.parse({
      ...sanitizedFields,
      password,
    });

    // Validate password complexity
    const passwordStrength = validatePasswordStrength(validatedData.password);
    if (!passwordStrength.valid) {
      return NextResponse.json(
        { error: "Password does not meet complexity requirements", details: passwordStrength.errors },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(validatedData.password);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: validatedData.email.toLowerCase(),
        passwordHash,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        role: validatedData.role,
        facilityId: validatedData.facilityId || null,
        phone: validatedData.phone || null,
        professionalId: validatedData.professionalId || null,
        isActive: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      });

    // Log action to audit log
    await logAudit({
      userId: currentUser.id,
      action: "create_user",
      tableName: "users",
      recordId: newUser.id,
      newValues: {
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("Error creating user:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("unique")) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const currentUser = await requireRole("admin");
    if (currentUser instanceof NextResponse) return currentUser;

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

    return NextResponse.json(userList);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

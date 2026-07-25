import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { hashPassword, getCurrentUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const passwordSchema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { password } = passwordSchema.parse(body);

    const passwordHash = await hashPassword(password);

    await db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })
      .where(eq(users.id, currentUser.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid password", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}

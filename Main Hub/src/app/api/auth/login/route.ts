import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { headers } from "next/headers";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

// Rate limit: 5 attempts per 15 minutes per IP
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    // Extract IP for rate limiting
    const headerStore = await headers();
    const clientIp =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      "unknown";

    // Check rate limit by IP
    const ipRateResult = rateLimit(`login:ip:${clientIp}`, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!ipRateResult.allowed) {
      await logAudit({
        userId: null,
        action: "login_rate_limited",
        tableName: "users",
        newValues: { ip: clientIp },
      });

      return NextResponse.json(
        {
          error: "Too many login attempts. Please try again later.",
          retryAfterSeconds: Math.ceil(ipRateResult.retryAfterMs / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(ipRateResult.retryAfterMs / 1000).toString(),
          },
        }
      );
    }

    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    // Also rate limit by email to prevent distributed brute force
    const emailRateResult = rateLimit(`login:email:${email.toLowerCase()}`, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!emailRateResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many login attempts for this account. Please try again later.",
          retryAfterSeconds: Math.ceil(emailRateResult.retryAfterMs / 1000),
        },
        { status: 429 }
      );
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      await logAudit({
        userId: null,
        action: "login_failed",
        tableName: "users",
        newValues: { email: email.toLowerCase(), reason: "user_not_found" },
      });

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      await logAudit({
        userId: user.id,
        action: "login_failed",
        tableName: "users",
        newValues: { reason: "account_disabled" },
      });

      return NextResponse.json(
        { error: "Account is disabled. Contact administrator." },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await logAudit({
        userId: user.id,
        action: "login_failed",
        tableName: "users",
        newValues: { reason: "invalid_password" },
      });

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Successful login — reset rate limits for this IP/email
    resetRateLimit(`login:ip:${clientIp}`);
    resetRateLimit(`login:email:${email.toLowerCase()}`);

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Create session
    await createSession(user.id);

    await logAudit({
      userId: user.id,
      action: "login_success",
      tableName: "users",
      recordId: user.id,
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "An error occurred during login" },
      { status: 500 }
    );
  }
}

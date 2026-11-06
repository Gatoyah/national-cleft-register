import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword, hashPassword, createSession, isLocked, recordFailedLogin, getClientInfo } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email").max(255),
  password: z.string().min(1, "Password is required").max(200),
});

// Per-IP throttle (slows brute force from one machine) — generous so a whole
// ward behind one IP is not locked out. Per-account lockout is the real guard.
const IP_MAX = 30;
const WINDOW_MS = 15 * 60 * 1000;
// Equalise timing for unknown emails so accounts cannot be enumerated.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

export async function POST(request: NextRequest) {
  try {
    const { ip } = await getClientInfo();
    const ipLimit = rateLimit(`login:ip:${ip}`, IP_MAX, WINDOW_MS);
    if (!ipLimit.allowed) {
      const retry = Math.ceil(ipLimit.retryAfterMs / 1000);
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later.", retryAfterSeconds: retry },
        { status: 429, headers: { "Retry-After": String(retry) } }
      );
    }

    const { email, password } = loginSchema.parse(await request.json());
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      await verifyPassword(password, await getDummyHash());
      await logAudit({ userId: null, action: "login_failed", tableName: "users", newValues: { email, reason: "user_not_found" } });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (isLocked(user)) {
      await logAudit({ userId: user.id, action: "login_blocked", tableName: "users", recordId: user.id, newValues: { reason: "locked" } });
      return NextResponse.json(
        { error: "Account temporarily locked after too many failed attempts. Try again in 15 minutes or ask an administrator to unlock it." },
        { status: 423 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const locked = await recordFailedLogin(user.id, user.failedLoginAttempts ?? 0);
      await logAudit({ userId: user.id, action: "login_failed", tableName: "users", recordId: user.id, newValues: { reason: "invalid_password", locked } });
      return NextResponse.json(
        { error: locked ? "Account locked for 15 minutes after too many failed attempts." : "Invalid email or password" },
        { status: locked ? 423 : 401 }
      );
    }

    if (!user.isActive) {
      await logAudit({ userId: user.id, action: "login_blocked", tableName: "users", recordId: user.id, newValues: { reason: "disabled" } });
      return NextResponse.json({ error: "Account is disabled. Contact your administrator." }, { status: 403 });
    }

    resetRateLimit(`login:ip:${ip}`);
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    await createSession(user.id, request.nextUrl.protocol);
    await logAudit({ userId: user.id, action: "login_success", tableName: "users", recordId: user.id });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: !!user.mustChangePassword,
    });
  } catch (error) {
    return apiError(error, "An error occurred during login");
  }
}

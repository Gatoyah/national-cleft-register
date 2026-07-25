import { NextRequest, NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, isIpBlocked, blockIp, logAudit, recordFailedLogin, isAccountLocked, addSecurityHeaders } from "@/lib/security";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || 
               request.headers.get("x-real-ip") || 
               "unknown";

    // Check if IP is blocked
    if (await isIpBlocked(ip)) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Access denied. Your IP has been blocked." },
          { status: 403 }
        )
      );
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(ip, "/api/auth/login", "login");
    if (!rateLimit.allowed) {
      // Block IP after too many attempts
      await blockIp(ip, "Too many login attempts", 60 * 60 * 1000); // 1 hour
      
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Too many login attempts. Please try again later." },
          { status: 429 }
        )
      );
    }

    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      await logAudit(null, "login_failed", "users", null, null, { email, reason: "user_not_found" }, request);
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        )
      );
    }

    // Check if account is locked
    if (await isAccountLocked(user.id)) {
      await logAudit(user.id, "login_blocked", "users", user.id, null, { reason: "account_locked" }, request);
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Account is locked. Please try again later or contact administrator." },
          { status: 401 }
        )
      );
    }

    // Check if user is active
    if (!user.isActive) {
      await logAudit(user.id, "login_blocked", "users", user.id, null, { reason: "account_disabled" }, request);
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Account is disabled. Contact administrator." },
          { status: 401 }
        )
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      const locked = await recordFailedLogin(user.id);
      await logAudit(user.id, "login_failed", "users", user.id, null, { reason: "invalid_password", locked }, request);
      
      return addSecurityHeaders(
        NextResponse.json(
          { error: locked ? "Account locked due to too many failed attempts" : "Invalid email or password" },
          { status: 401 }
        )
      );
    }

    // Create session
    await createSession(user.id);
    await logAudit(user.id, "login_success", "users", user.id, null, null, request);

    const response = NextResponse.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });

    return addSecurityHeaders(response);
  } catch (error) {
    console.error("Login error:", error);
    
    if (error instanceof z.ZodError) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Invalid input" },
          { status: 400 }
        )
      );
    }

    return addSecurityHeaders(
      NextResponse.json(
        { error: "An error occurred" },
        { status: 500 }
      )
    );
  }
}

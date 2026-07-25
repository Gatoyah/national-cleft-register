import { NextRequest, NextResponse } from "next/server";
import { db, rateLimits, blockedIps, auditLogs, sessions, users } from "@/db";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import crypto from "crypto";

// ============================================================================
// ENCRYPTION (AES-256-GCM)
// ============================================================================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

// ============================================================================
// HASHING (SHA-256 for API keys, bcrypt for passwords)
// ============================================================================

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function generateApiKey(): string {
  return `ncr_${crypto.randomBytes(32).toString("hex")}`;
}

export function generateSecureToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

// ============================================================================
// RATE LIMITING
// ============================================================================

const RATE_LIMITS = {
  login: { max: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 min
  api: { max: 100, windowMs: 60 * 1000 }, // 100 requests per minute
  sync: { max: 10, windowMs: 60 * 1000 }, // 10 sync requests per minute
};

export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  type: keyof typeof RATE_LIMITS = "api"
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const config = RATE_LIMITS[type];
  const windowStart = new Date(Date.now() - config.windowMs);

  // Check existing rate limit record
  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.identifier, identifier),
        eq(rateLimits.endpoint, endpoint),
        gte(rateLimits.windowStart, windowStart)
      )
    )
    .limit(1);

  if (existing) {
    const currentCount = existing.requestCount ?? 0;
    if (currentCount >= config.max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(existing.windowStart.getTime() + config.windowMs),
      };
    }

    // Increment counter
    await db
      .update(rateLimits)
      .set({ requestCount: currentCount + 1 })
      .where(eq(rateLimits.id, existing.id));

    return {
      allowed: true,
      remaining: config.max - currentCount - 1,
      resetAt: new Date(existing.windowStart.getTime() + config.windowMs),
    };
  }

  // Create new rate limit record
  await db.insert(rateLimits).values({
    identifier,
    endpoint,
    requestCount: 1,
    windowStart: new Date(),
  });

  return {
    allowed: true,
    remaining: config.max - 1,
    resetAt: new Date(Date.now() + config.windowMs),
  };
}

// ============================================================================
// IP BLOCKING
// ============================================================================

export async function isIpBlocked(ip: string): Promise<boolean> {
  const [blocked] = await db
    .select()
    .from(blockedIps)
    .where(eq(blockedIps.ipAddress, ip))
    .limit(1);

  if (!blocked) return false;

  // Check if block has expired
  if (blocked.blockedUntil && blocked.blockedUntil < new Date()) {
    await db.delete(blockedIps).where(eq(blockedIps.id, blocked.id));
    return false;
  }

  return true;
}

export async function blockIp(ip: string, reason: string, durationMs?: number): Promise<void> {
  const blockedUntil = durationMs ? new Date(Date.now() + durationMs) : null;

  await db
    .insert(blockedIps)
    .values({
      ipAddress: ip,
      reason,
      blockedUntil,
    })
    .onConflictDoUpdate({
      target: blockedIps.ipAddress,
      set: { reason, blockedUntil },
    });
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export async function logAudit(
  userId: number | null,
  action: string,
  tableName: string,
  recordId: number | null,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
  request?: NextRequest
): Promise<void> {
  await db.insert(auditLogs).values({
    userId,
    action,
    tableName,
    recordId,
    oldValues,
    newValues,
    ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0] || request?.headers.get("x-real-ip") || null,
    userAgent: request?.headers.get("user-agent") || null,
  });
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export async function createSession(userId: number, request?: NextRequest): Promise<string> {
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(sessions).values({
    userId,
    sessionToken: hashApiKey(token), // Store hashed token
    ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0] || null,
    userAgent: request?.headers.get("user-agent") || null,
    expiresAt,
  });

  // Update user last login
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      lastLoginIp: request?.headers.get("x-forwarded-for")?.split(",")[0] || null,
      failedLoginAttempts: 0,
    })
    .where(eq(users.id, userId));

  return token;
}

export async function validateSession(token: string): Promise<{ userId: number } | null> {
  const hashedToken = hashApiKey(token);

  const [session] = await db
    .select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.sessionToken, hashedToken))
    .limit(1);

  if (!session) return null;

  // Check expiry
  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.sessionToken, hashedToken));
    return null;
  }

  return { userId: session.userId };
}

export async function destroySession(token: string): Promise<void> {
  const hashedToken = hashApiKey(token);
  await db.delete(sessions).where(eq(sessions.sessionToken, hashedToken));
}

export async function destroyAllUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ============================================================================
// INPUT SANITIZATION
// ============================================================================

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/['"`;]/g, "") // Remove potential SQL injection chars
    .trim();
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

// ============================================================================
// SECURITY HEADERS
// ============================================================================

export function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'"
  );
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  
  return response;
}

// ============================================================================
// FAILED LOGIN HANDLING
// ============================================================================

export async function recordFailedLogin(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ failedLoginAttempts: users.failedLoginAttempts })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const attempts = (user?.failedLoginAttempts || 0) + 1;
  const lockDuration = 15 * 60 * 1000; // 15 minutes

  // Lock account after 5 failed attempts
  const shouldLock = attempts >= 5;

  await db
    .update(users)
    .set({
      failedLoginAttempts: attempts,
      lockedUntil: shouldLock ? new Date(Date.now() + lockDuration) : null,
    })
    .where(eq(users.id, userId));

  return shouldLock;
}

export async function isAccountLocked(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.lockedUntil) return false;

  if (user.lockedUntil < new Date()) {
    // Unlock account
    await db
      .update(users)
      .set({ lockedUntil: null, failedLoginAttempts: 0 })
      .where(eq(users.id, userId));
    return false;
  }

  return true;
}

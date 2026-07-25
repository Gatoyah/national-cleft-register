import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { db, users, sessions } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

const SALT_ROUNDS = 12;
const SESSION_COOKIE = "ncr_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 1 week

// ============================================================================
// PASSWORD UTILITIES
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password complexity.
 * Requires: min 12 chars, uppercase, lowercase, digit, special character.
 */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must be at least 12 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least one digit");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain at least one special character");
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// SESSION MANAGEMENT — Database-backed, cryptographically secure
// ============================================================================

/**
 * Hash a session token using SHA-256 for storage.
 * The raw token is given to the client; only the hash is stored in the DB.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a cryptographically secure session token.
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a new session for a user.
 * Generates a random token, stores its hash in the database,
 * and sets the raw token as an httpOnly cookie.
 */
export async function createSession(userId: number): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  // Extract IP and user agent for the session record
  let ipAddress = "unknown";
  let userAgent = "unknown";
  try {
    const headerStore = await headers();
    ipAddress =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      "unknown";
    userAgent = headerStore.get("user-agent") || "unknown";
  } catch {
    // Headers may not be available in some contexts
  }

  // Store hashed token in the database
  await db.insert(sessions).values({
    tokenHash,
    userId,
    expiresAt,
    ipAddress,
    userAgent,
  });

  // Set the raw token as an httpOnly cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return token;
}

/**
 * Retrieve the current session from the cookie.
 * Hashes the cookie token and looks it up in the database.
 * Returns null if no valid session exists or if expired.
 */
export async function getSession(): Promise<{ userId: number; tokenHash: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const tokenHash = hashToken(token);

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) return null;

  return { userId: session.userId, tokenHash: session.tokenHash };
}

/**
 * Get the raw session token from the cookie (for CSRF token generation).
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || null;
}

/**
 * Get the current authenticated user, or null if not logged in.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user || null;
}

/**
 * Destroy the current session (logout).
 * Deletes the session row from the database and clears the cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const tokenHash = hashToken(token);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Destroy all sessions for a specific user (admin session revocation).
 */
export async function destroyAllUserSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ============================================================================
// AUTH MIDDLEWARE — For use in API routes
// ============================================================================

/**
 * Require authentication. Returns the authenticated user or sends 401.
 * Usage in API routes:
 *   const user = await requireAuth();
 *   if (user instanceof NextResponse) return user; // 401 response
 */
export async function requireAuth(): Promise<
  typeof users.$inferSelect | NextResponse
> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required. Please log in." },
      { status: 401 }
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: "Account is disabled. Contact administrator." },
      { status: 403 }
    );
  }

  return user;
}

/**
 * Require authentication AND a specific role.
 * Returns the authenticated user or sends 401/403.
 * Usage:
 *   const user = await requireRole("admin", "clinician", "surgeon");
 *   if (user instanceof NextResponse) return user;
 */
export async function requireRole(
  ...allowedRoles: string[]
): Promise<typeof users.$inferSelect | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const user = result;
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions for this action." },
      { status: 403 }
    );
  }

  return user;
}

// ============================================================================
// ROLE-BASED ACCESS CONTROL HELPERS
// ============================================================================

export function canAccessPatientData(userRole: string): boolean {
  return ["admin", "clinician", "surgeon", "data_clerk", "community_health_worker"].includes(userRole);
}

export function canEditPatientData(userRole: string): boolean {
  return ["admin", "clinician", "surgeon", "data_clerk"].includes(userRole);
}

export function canAccessResearchData(userRole: string): boolean {
  return ["admin", "researcher"].includes(userRole);
}

export function canManageUsers(userRole: string): boolean {
  return userRole === "admin";
}

export function canPerformSurgery(userRole: string): boolean {
  return ["admin", "surgeon"].includes(userRole);
}

// ============================================================================
// API KEY UTILITIES — For sync endpoint authentication
// ============================================================================

/**
 * Generate a new API key. Returns both the raw key (to give to the facility)
 * and the hash (to store in the database).
 */
export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = `ncr_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = hashToken(rawKey);
  const keyPrefix = rawKey.slice(0, 8);
  return { rawKey, keyHash, keyPrefix };
}

/**
 * Validate an API key against the database.
 * Returns the facility ID if valid, null otherwise.
 */
export async function validateApiKey(rawKey: string): Promise<{
  facilityId: number;
  keyId: number;
} | null> {
  // Dynamic import to avoid circular dependency
  const { apiKeys } = await import("@/db");

  const keyHash = hashToken(rawKey);

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        eq(apiKeys.isActive, true)
      )
    )
    .limit(1);

  if (!key) return null;

  // Update last used timestamp (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => {}); // Don't block the request

  return { facilityId: key.facilityId, keyId: key.id };
}

/**
 * Generate a cryptographically random password of the given length.
 */
export function generateRandomPassword(length: number = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, users, sessions } from "@/db";
import { eq, and, gt, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { cookieSecure, SESSION_TTL_HOURS } from "@/lib/env";
import { hasPermission, type Permission } from "@/lib/permissions";
import { validateCsrfToken } from "@/lib/csrf";

const SALT_ROUNDS = 12;
export const SESSION_COOKIE = "ncr_regional_session";
const SESSION_MAX_AGE_SECONDS = SESSION_TTL_HOURS * 60 * 60;

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// ============================================================================
// PASSWORDS
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Min 12 chars, upper, lower, digit, special character. */
export function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof password !== "string") return { valid: false, errors: ["Password is required"] };
  if (password.length < 12) errors.push("Password must be at least 12 characters");
  if (password.length > 128) errors.push("Password must be at most 128 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least one digit");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain at least one special character");
  return { valid: errors.length === 0, errors };
}

/** Cryptographically random password that always satisfies the policy. */
export function generateRandomPassword(length = 16): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%^&*-_"];
  const all = sets.join("");
  const chars = sets.map((s) => s[crypto.randomInt(s.length)]);
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ============================================================================
// ACCOUNT LOCKOUT (per account, stored in DB — survives restarts)
// ============================================================================

export function isLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil > new Date();
}

export async function recordFailedLogin(userId: number, currentAttempts: number): Promise<boolean> {
  const attempts = currentAttempts + 1;
  const lock = attempts >= MAX_FAILED_LOGINS;
  await db
    .update(users)
    .set({
      failedLoginAttempts: lock ? 0 : attempts,
      lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
    })
    .where(eq(users.id, userId));
  return lock;
}

// ============================================================================
// SESSIONS — random token in an httpOnly cookie, only its SHA-256 in the DB
// ============================================================================

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getClientInfo(): Promise<{ ip: string; userAgent: string; proto: string | null }> {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local",
      userAgent: (h.get("user-agent") || "unknown").slice(0, 500),
      proto: h.get("x-forwarded-proto"),
    };
  } catch {
    return { ip: "local", userAgent: "unknown", proto: null };
  }
}

export async function createSession(userId: number, requestProtocol?: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const { ip, userAgent, proto } = await getClientInfo();

  // Housekeeping: drop expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  await db.insert(sessions).values({
    sessionToken: hashToken(token),
    userId,
    expiresAt,
    ipAddress: ip,
    userAgent,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(proto, requestProtocol),
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value || null;
}

export async function getSession(): Promise<{ userId: number; tokenHash: string } | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.sessionToken, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return session ? { userId: session.userId, tokenHash } : null;
}

/** Fields that are safe to hand to pages / client components (no password hash). */
const safeUserColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  role: users.role,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
};

export type CurrentUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean | null;
  mustChangePassword: boolean | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  const [user] = await db.select(safeUserColumns).from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || !user.isActive) return null;
  return user;
}

export async function destroySession(): Promise<void> {
  const token = await getSessionToken();
  if (token) await db.delete(sessions).where(eq(sessions.sessionToken, hashToken(token)));
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function destroyAllUserSessions(userId: number, exceptTokenHash?: string): Promise<void> {
  const all = await db.select({ id: sessions.id, tokenHash: sessions.sessionToken }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) {
    if (s.tokenHash !== exceptTokenHash) await db.delete(sessions).where(eq(sessions.id, s.id));
  }
}

// ============================================================================
// API ROUTE GUARDS
// ============================================================================

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Require a logged-in, active user. Users who must change their password can
 * only reach the change-password / logout endpoints.
 */
export async function requireAuth(options: { allowMustChangePassword?: boolean } = {}): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentication required. Please log in.", 401);
  if (user.mustChangePassword && !options.allowMustChangePassword) {
    return jsonError("You must change your password before continuing.", 403);
  }
  return user;
}

/** Require a logged-in user holding a permission. */
export async function requirePermission(permission: Permission): Promise<CurrentUser | NextResponse> {
  const user = await requireAuth();
  if (user instanceof NextResponse) return user;
  if (!hasPermission(user.role, permission)) return jsonError("Insufficient permissions for this action.", 403);
  return user;
}

/** Validate the x-csrf-token header for state-changing requests. Returns an error response or null. */
export async function checkCsrf(request: NextRequest): Promise<NextResponse | null> {
  const csrfToken = request.headers.get("x-csrf-token");
  const sessionToken = await getSessionToken();
  if (!csrfToken || !sessionToken || !validateCsrfToken(csrfToken, sessionToken)) {
    return jsonError("Invalid or missing CSRF token. Refresh the page and try again.", 403);
  }
  return null;
}

/** Permission + CSRF in one call, for POST/PATCH/DELETE handlers. */
export async function requireMutation(request: NextRequest, permission: Permission): Promise<CurrentUser | NextResponse> {
  const user = await requirePermission(permission);
  if (user instanceof NextResponse) return user;
  const csrfError = await checkCsrf(request);
  if (csrfError) return csrfError;
  return user;
}

// ============================================================================
// PAGE GUARDS (server components)
// ============================================================================

export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account?mustChange=1");
  return user;
}

export async function requirePagePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (!hasPermission(user.role, permission)) redirect("/forbidden");
  return user;
}

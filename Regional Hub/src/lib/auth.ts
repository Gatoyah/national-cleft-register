import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db, users, sessions } from "@/db";
import { eq } from "drizzle-orm";
import { validateSession, createSession as createDbSession, destroySession as destroyDbSession, hashApiKey } from "./security";

const SALT_ROUNDS = 12;
const SESSION_COOKIE = "ncr_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number): Promise<string> {
  const token = await createDbSession(userId);
  const cookieStore = await cookies();
  
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  });
  
  return token;
}

export async function getSession(): Promise<{ userId: number } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  
  if (!token) return null;
  
  return validateSession(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  
  if (!user || !user.isActive) return null;
  
  return user;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  
  if (token) {
    await destroyDbSession(token);
  }
  
  cookieStore.delete(SESSION_COOKIE);
}

export function canEditPatientData(userRole: string): boolean {
  return ["admin", "clinician", "surgeon", "data_clerk"].includes(userRole);
}

export function canRecordSurgery(userRole: string): boolean {
  return ["admin", "surgeon"].includes(userRole);
}

export function canManageUsers(userRole: string): boolean {
  return userRole === "admin";
}

export function canAccessSync(userRole: string): boolean {
  return userRole === "admin";
}

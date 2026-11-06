import { NextRequest, NextResponse } from "next/server";
import { db, users, facilities } from "@/db";
import { eq } from "drizzle-orm";
import { hashPassword, validatePasswordStrength, createSession } from "@/lib/auth";
import { needsSetup, getOrCreateSetupToken, verifySetupToken, clearSetupToken } from "@/lib/setup";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";
import { z } from "zod";

const setupSchema = z.object({
  setupToken: z.string().min(1, "Setup token is required"),
  email: z.string().trim().toLowerCase().email().max(255),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: z.string(),
});

/** GET: does this server still need its first administrator? */
export async function GET() {
  const pending = await needsSetup();
  if (pending) getOrCreateSetupToken(); // make sure the token is printed
  return NextResponse.json({ needsSetup: pending });
}

/** POST: create the first administrator (requires the one-time setup token). */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit("setup", 10, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

    if (!(await needsSetup())) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 409 });
    }

    const body = setupSchema.parse(await request.json());
    if (!verifySetupToken(body.setupToken)) {
      return NextResponse.json({ error: "Invalid setup token. Check the server console or setup-token.txt." }, { status: 403 });
    }
    const strength = validatePasswordStrength(body.password);
    if (!strength.valid) {
      return NextResponse.json({ error: "Password does not meet requirements", details: strength.errors }, { status: 400 });
    }

    // The Main Hub's own facility (KATH, the national cleft centre).
    let [kath] = await db.select().from(facilities).where(eq(facilities.code, "KATH")).limit(1);
    if (!kath) {
      [kath] = await db
        .insert(facilities)
        .values({
          name: "Komfo Anokye Teaching Hospital",
          code: "KATH",
          facilityType: "hub",
          region: "ashanti",
          district: "Kumasi Metropolitan",
          address: "P.O. Box 1934, Kumasi, Ghana",
          hasInternet: true,
          isActive: true,
        })
        .returning();
    }

    const [admin] = await db
      .insert(users)
      .values({
        email: body.email,
        passwordHash: await hashPassword(body.password),
        firstName: body.firstName,
        lastName: body.lastName,
        role: "admin",
        facilityId: kath.id,
        isActive: true,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })
      .returning({ id: users.id, email: users.email });

    clearSetupToken();
    await logAudit({ userId: admin.id, action: "setup_admin_created", tableName: "users", recordId: admin.id, newValues: { email: admin.email } });
    await createSession(admin.id, request.nextUrl.protocol);

    return NextResponse.json({ success: true, admin }, { status: 201 });
  } catch (error) {
    return apiError(error, "Setup failed");
  }
}

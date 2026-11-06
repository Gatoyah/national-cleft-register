import { NextRequest, NextResponse } from "next/server";
import { db, users, facilityConfig } from "@/db";
import { hashPassword, validatePasswordStrength, createSession } from "@/lib/auth";
import { needsSetup, getOrCreateSetupToken, verifySetupToken, clearSetupToken } from "@/lib/setup";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { apiError, REGIONS } from "@/lib/api";
import { z } from "zod";

const setupSchema = z.object({
  setupToken: z.string().min(1, "Setup token is required"),
  email: z.string().trim().toLowerCase().email().max(255),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: z.string(),
  facilityName: z.string().trim().min(1, "Hospital name is required").max(255),
  facilityCode: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, - and _ only"),
  region: z.enum(REGIONS),
  district: z.string().max(100).optional(),
});

export async function GET() {
  const pending = await needsSetup();
  if (pending) getOrCreateSetupToken();
  return NextResponse.json({ needsSetup: pending });
}

/** First run: record which hospital this hub is, and create its administrator. */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit("setup", 10, 15 * 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    if (!(await needsSetup())) return NextResponse.json({ error: "Setup already completed" }, { status: 409 });

    const body = setupSchema.parse(await request.json());
    if (!verifySetupToken(body.setupToken)) {
      return NextResponse.json({ error: "Invalid setup token. Check the server console or setup-token.txt." }, { status: 403 });
    }
    const strength = validatePasswordStrength(body.password);
    if (!strength.valid) {
      return NextResponse.json({ error: "Password does not meet requirements", details: strength.errors }, { status: 400 });
    }

    const [existing] = await db.select().from(facilityConfig).limit(1);
    if (!existing) {
      await db.insert(facilityConfig).values({
        facilityName: body.facilityName,
        facilityCode: body.facilityCode.toUpperCase(),
        facilityType: "regional_hub",
        region: body.region,
        district: body.district || null,
        mainHubUrl: process.env.MAIN_HUB_URL || null,
        syncEnabled: true,
      });
    }

    const [admin] = await db
      .insert(users)
      .values({
        email: body.email,
        passwordHash: await hashPassword(body.password),
        firstName: body.firstName,
        lastName: body.lastName,
        role: "admin",
        isActive: true,
        mustChangePassword: false,
      })
      .returning({ id: users.id, email: users.email });

    clearSetupToken();
    await logAudit({ userId: admin.id, action: "setup_admin_created", tableName: "users", recordId: admin.id, newValues: { email: admin.email, facilityCode: body.facilityCode } });
    await createSession(admin.id, request.nextUrl.protocol);
    return NextResponse.json({ success: true, admin }, { status: 201 });
  } catch (error) {
    return apiError(error, "Setup failed");
  }
}

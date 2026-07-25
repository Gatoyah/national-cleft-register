import { NextResponse } from "next/server";
import { db, users, facilityConfig } from "@/db";
import { hashPassword } from "@/lib/auth";
import { generateApiKey, hashApiKey, encrypt } from "@/lib/security";
import { count } from "drizzle-orm";

const DEFAULT_ADMIN_EMAIL = "admin@ncr.gov.gh";
const DEFAULT_ADMIN_PASSWORD = "Admin123!";

// Initial setup endpoint - creates default admin user and facility config
export async function POST() {
  try {
    // Check if already set up
    const [userCount] = await db.select({ count: count() }).from(users);
    
    if (userCount.count > 0) {
      return NextResponse.json(
        { error: "Setup already completed" },
        { status: 400 }
      );
    }

    // Generate API key for main hub communication
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const encryptedApiKey = encrypt(apiKey);

    // Create facility config
    const [facility] = await db
      .insert(facilityConfig)
      .values({
        facilityName: "Regional Cleft Centre",
        facilityCode: "RCC",
        facilityType: "regional_hub",
        region: "ashanti",
        mainHubUrl: process.env.MAIN_HUB_URL || "https://main-hub.ncr.gov.gh",
        apiKey: encryptedApiKey,
        apiKeyHash: apiKeyHash,
        syncEnabled: true,
      })
      .returning();

    // Create admin user
    const adminPassword = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    const [adminUser] = await db
      .insert(users)
      .values({
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash: adminPassword,
        firstName: "Regional",
        lastName: "Administrator",
        role: "admin",
        isActive: true,
        mustChangePassword: false,
      } as any)
      .returning();

    return NextResponse.json({
      message: "Setup completed successfully",
      facility: {
        id: facility.facilityId,
        code: facility.facilityCode,
        name: facility.facilityName,
      },
      admin: {
        email: adminUser.email,
        tempPassword: DEFAULT_ADMIN_PASSWORD,
        note: "Use this password to sign in.",
      },
      apiKey: {
        key: apiKey,
        note: "Save this API key securely. It will not be shown again.",
      },
    });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: "Setup failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { db, users, facilities, apiKeys } from "@/db";
import { hashPassword, generateApiKey } from "@/lib/auth";
import { count } from "drizzle-orm";

const DEFAULT_ADMIN_EMAIL = "admin@ncr.gov.gh";
const DEFAULT_ADMIN_PASSWORD = "Admin123!";

// Initial setup endpoint - creates default admin user, facilities, and API keys
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

    // Create KATH facility
    const [kath] = await db
      .insert(facilities)
      .values({
        name: "Komfo Anokye Teaching Hospital",
        code: "KATH",
        facilityType: "hub",
        region: "ashanti",
        district: "Kumasi Metropolitan",
        address: "P.O. Box 1934, Kumasi, Ghana",
        phone: "+233 3220 22307",
        email: "info@kath.gov.gh",
        hasInternet: true,
        isActive: true,
      })
      .returning();

    // Create Korle Bu facility
    const [kbth] = await db.insert(facilities).values({
      name: "Korle Bu Teaching Hospital",
      code: "KBTH",
      facilityType: "co_hub",
      region: "greater_accra",
      district: "Accra Metropolitan",
      address: "Korle Bu, Accra, Ghana",
      hasInternet: true,
      isActive: true,
    }).returning();

    // Create Tamale Teaching Hospital
    const [tth] = await db.insert(facilities).values({
      name: "Tamale Teaching Hospital",
      code: "TTH",
      facilityType: "co_hub",
      region: "northern",
      district: "Tamale Metropolitan",
      hasInternet: true,
      isActive: true,
    }).returning();

    const adminPasswordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    const [adminUser] = await db
      .insert(users)
      .values({
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash: adminPasswordHash,
        firstName: "Registry",
        lastName: "Administrator",
        role: "admin",
        facilityId: kath.id,
        isActive: true,
      } as any)
      .returning();

    // Generate API keys for each facility
    const kathKey = generateApiKey();
    const kbthKey = generateApiKey();
    const tthKey = generateApiKey();

    await db.insert(apiKeys).values([
      {
        facilityId: kath.id,
        keyHash: kathKey.keyHash,
        keyPrefix: kathKey.keyPrefix,
        label: "KATH Default Key",
        isActive: true,
      },
      {
        facilityId: kbth.id,
        keyHash: kbthKey.keyHash,
        keyPrefix: kbthKey.keyPrefix,
        label: "KBTH Default Key",
        isActive: true,
      },
      {
        facilityId: tth.id,
        keyHash: tthKey.keyHash,
        keyPrefix: tthKey.keyPrefix,
        label: "TTH Default Key",
        isActive: true,
      },
    ]);

    // Log credentials to server console (not in HTTP response!)
    console.log("=".repeat(60));
    console.log("NCR SETUP COMPLETED — SAVE THESE CREDENTIALS SECURELY");
    console.log("=".repeat(60));
    console.log(`Admin Email:     ${adminUser.email}`);
    console.log(`Admin Password:  ${DEFAULT_ADMIN_PASSWORD}`);
    console.log("-".repeat(60));
    console.log("FACILITY API KEYS (for sync):");
    console.log(`  KATH: ${kathKey.rawKey}`);
    console.log(`  KBTH: ${kbthKey.rawKey}`);
    console.log(`  TTH:  ${tthKey.rawKey}`);
    console.log("=".repeat(60));
    console.log("IMPORTANT: Change these passwords on first login!");
    console.log("=".repeat(60));

    return NextResponse.json({
      message: "Setup completed successfully. Check the server console/logs for credentials.",
      admin: {
        email: adminUser.email,
        // Password is NOT returned in the HTTP response for security
      },
      facilities: [
        { name: "KATH", code: "KATH", id: kath.id },
        { name: "KBTH", code: "KBTH", id: kbth.id },
        { name: "TTH", code: "TTH", id: tth.id },
      ],
      note: "Use the fixed admin credentials above to sign in.",
    });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { error: "Setup failed" },
      { status: 500 }
    );
  }
}

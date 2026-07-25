import { NextRequest, NextResponse } from "next/server";
import { db, patients, surgeries, facilities } from "@/db";
import { validateApiKey } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { eq, desc } from "drizzle-orm";

// Endpoint for regional hubs to pull data from main hub
export async function GET(request: NextRequest) {
  try {
    // Require valid API key in Authorization: Bearer <key> header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized. Missing or invalid Authorization header." },
        { status: 401 }
      );
    }

    const rawKey = authHeader.substring(7).trim();
    const keyResult = await validateApiKey(rawKey);
    if (!keyResult) {
      // Log unauthorized pull attempt
      await logAudit({
        userId: null,
        action: "sync_pull_unauthorized",
        tableName: "facilities",
      });

      return NextResponse.json(
        { error: "Unauthorized. Invalid API key." },
        { status: 401 }
      );
    }

    const facilityId = keyResult.facilityId;

    // Verify facility exists
    const [facility] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, facilityId))
      .limit(1);

    if (!facility) {
      return NextResponse.json(
        { error: "Facility associated with the API key was not found" },
        { status: 404 }
      );
    }

    // Get patients registered at this facility that have been updated
    let patientsQuery = db
      .select({
        id: patients.id,
        ncrId: patients.ncrId,
        firstName: patients.firstName,
        lastName: patients.lastName,
        dateOfBirth: patients.dateOfBirth,
        sex: patients.sex,
        regionOfResidence: patients.regionOfResidence,
        updatedAt: patients.updatedAt,
      })
      .from(patients)
      .where(eq(patients.registeredAtFacilityId, facility.id))
      .orderBy(desc(patients.updatedAt))
      .limit(100);

    // Get surgeries performed at this facility
    let surgeriesQuery = db
      .select({
        id: surgeries.id,
        patientId: surgeries.patientId,
        surgeryDate: surgeries.surgeryDate,
        surgeryType: surgeries.surgeryType,
        updatedAt: surgeries.updatedAt,
      })
      .from(surgeries)
      .where(eq(surgeries.facilityId, facility.id))
      .orderBy(desc(surgeries.updatedAt))
      .limit(100);

    const [patientList, surgeryList] = await Promise.all([
      patientsQuery,
      surgeriesQuery,
    ]);

    // Log successful pull
    await logAudit({
      userId: null,
      action: "sync_pull_success",
      tableName: "facilities",
      recordId: facility.id,
      newValues: { facilityCode: facility.code },
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      facility: {
        id: facility.id,
        code: facility.code,
        name: facility.name,
      },
      data: {
        patients: patientList,
        surgeries: surgeryList,
      },
    });
  } catch (error) {
    console.error("Pull error:", error);
    return NextResponse.json(
      { error: "Failed to pull data" },
      { status: 500 }
    );
  }
}

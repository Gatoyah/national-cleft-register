import { NextRequest, NextResponse } from "next/server";
import { db, patients, diagnoses, syncQueue } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit, addSecurityHeaders, sanitizeObject, checkRateLimit } from "@/lib/security";
import { desc, count, eq } from "drizzle-orm";
import { z } from "zod";

const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().min(1),
  sex: z.enum(["male", "female", "intersex"]),
  placeOfBirth: z.string().max(255).optional(),
  regionOfResidence: z.enum([
    "ashanti", "greater_accra", "northern", "western", "eastern",
    "central", "volta", "upper_east", "upper_west", "bono",
    "bono_east", "ahafo", "western_north", "oti", "north_east", "savannah"
  ]),
  districtOfResidence: z.string().max(100).optional(),
  townVillage: z.string().max(255).optional(),
  gpsLatitude: z.string().optional(),
  gpsLongitude: z.string().optional(),
  caregiverName: z.string().min(1).max(255),
  caregiverRelationship: z.string().max(50).optional(),
  caregiverPhone: z.string().max(20).optional(),
  caregiverPhone2: z.string().max(20).optional(),
  // Diagnosis
  cleftType: z.enum(["cleft_lip_only", "cleft_palate_only", "cleft_lip_and_palate"]).optional(),
  lipLaterality: z.enum(["unilateral_left", "unilateral_right", "bilateral", "midline"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(String(user.id), "/api/patients", "api");
    if (!rateLimit.allowed) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
      );
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createPatientSchema.parse(sanitizedBody);

    // Create patient
    const [newPatient] = await db
      .insert(patients)
      .values({
        firstName: validatedData.firstName,
        middleName: validatedData.middleName || null,
        lastName: validatedData.lastName,
        dateOfBirth: validatedData.dateOfBirth,
        sex: validatedData.sex,
        placeOfBirth: validatedData.placeOfBirth || null,
        regionOfResidence: validatedData.regionOfResidence,
        districtOfResidence: validatedData.districtOfResidence || null,
        townVillage: validatedData.townVillage || null,
        gpsLatitude: validatedData.gpsLatitude || null,
        gpsLongitude: validatedData.gpsLongitude || null,
        caregiverName: validatedData.caregiverName,
        caregiverRelationship: validatedData.caregiverRelationship || null,
        caregiverPhone: validatedData.caregiverPhone || null,
        caregiverPhone2: validatedData.caregiverPhone2 || null,
        registeredByUserId: user.id,
        syncStatus: "pending",
      })
      .returning();

    // Create diagnosis if cleft type provided
    if (validatedData.cleftType) {
      await db.insert(diagnoses).values({
        patientId: newPatient.id,
        diagnosisDate: new Date().toISOString().split("T")[0],
        diagnosedAtBirth: true,
        cleftType: validatedData.cleftType,
        lipInvolved: validatedData.cleftType !== "cleft_palate_only",
        lipLaterality: validatedData.lipLaterality || null,
        palateInvolved: validatedData.cleftType !== "cleft_lip_only",
        diagnosedByUserId: user.id,
        syncStatus: "pending",
      });
    }

    // Add to sync queue
    await db.insert(syncQueue).values({
      tableName: "patients",
      recordLocalId: newPatient.localId,
      operation: "create",
      payload: newPatient,
      priority: 1,
    });

    await logAudit(user.id, "create", "patients", newPatient.id, null, { localId: newPatient.localId }, request);

    return addSecurityHeaders(
      NextResponse.json(newPatient, { status: 201 })
    );
  } catch (error) {
    console.error("Error creating patient:", error);
    
    if (error instanceof z.ZodError) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to create patient" }, { status: 500 })
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = (page - 1) * limit;

    const [patientList, totalCount] = await Promise.all([
      db.select().from(patients).orderBy(desc(patients.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(patients),
    ]);

    return addSecurityHeaders(
      NextResponse.json({
        patients: patientList,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.count || 0,
          totalPages: Math.ceil((totalCount[0]?.count || 0) / limit),
        },
      })
    );
  } catch (error) {
    console.error("Error fetching patients:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 })
    );
  }
}

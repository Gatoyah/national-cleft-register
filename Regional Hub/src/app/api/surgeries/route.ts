import { NextRequest, NextResponse } from "next/server";
import { db, surgeries, patients, syncQueue } from "@/db";
import { getCurrentUser, canRecordSurgery } from "@/lib/auth";
import { logAudit, addSecurityHeaders, sanitizeObject, checkRateLimit } from "@/lib/security";
import { desc, eq, count } from "drizzle-orm";
import { z } from "zod";

const createSurgerySchema = z.object({
  patientId: z.coerce.number().min(1),
  surgeryDate: z.string().min(1),
  surgeryType: z.enum([
    "primary_lip_repair", "primary_palate_repair", "secondary_lip_revision",
    "alveolar_bone_graft", "pharyngoplasty", "fistula_repair", "rhinoplasty", "other"
  ]),
  isPrimarySurgery: z.coerce.boolean().optional(),
  procedureDescription: z.string().max(2000).optional(),
  surgeonName: z.string().max(255).optional(),
  durationMinutes: z.coerce.number().optional(),
  complications: z.coerce.boolean().optional(),
  complicationsDetails: z.string().max(2000).optional(),
  dischargeDate: z.string().optional(),
  dischargeCondition: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    if (!canRecordSurgery(user.role)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      );
    }

    const rateLimit = await checkRateLimit(String(user.id), "/api/surgeries", "api");
    if (!rateLimit.allowed) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
      );
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createSurgerySchema.parse(sanitizedBody);

    // Verify patient exists
    const [patient] = await db
      .select({ id: patients.id, localId: patients.localId })
      .from(patients)
      .where(eq(patients.id, validatedData.patientId))
      .limit(1);

    if (!patient) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Patient not found" }, { status: 404 })
      );
    }

    const [newSurgery] = await db
      .insert(surgeries)
      .values({
        patientId: validatedData.patientId,
        surgeryDate: validatedData.surgeryDate,
        surgeryType: validatedData.surgeryType,
        isPrimarySurgery: validatedData.isPrimarySurgery ?? true,
        procedureDescription: validatedData.procedureDescription || null,
        surgeonName: validatedData.surgeonName || null,
        surgeonUserId: user.id,
        durationMinutes: validatedData.durationMinutes || null,
        complications: validatedData.complications ?? false,
        complicationsDetails: validatedData.complicationsDetails || null,
        dischargeDate: validatedData.dischargeDate || null,
        dischargeCondition: validatedData.dischargeCondition || null,
        syncStatus: "pending",
      })
      .returning();

    // Add to sync queue
    await db.insert(syncQueue).values({
      tableName: "surgeries",
      recordLocalId: newSurgery.localId,
      operation: "create",
      payload: { ...newSurgery, patientLocalId: patient.localId },
      priority: 1,
    });

    await logAudit(user.id, "create", "surgeries", newSurgery.id, null, { localId: newSurgery.localId }, request);

    return addSecurityHeaders(
      NextResponse.json(newSurgery, { status: 201 })
    );
  } catch (error) {
    console.error("Error creating surgery:", error);
    
    if (error instanceof z.ZodError) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      );
    }

    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to record surgery" }, { status: 500 })
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

    const [surgeryList, totalCount] = await Promise.all([
      db
        .select({
          id: surgeries.id,
          localId: surgeries.localId,
          patientId: surgeries.patientId,
          surgeryDate: surgeries.surgeryDate,
          surgeryType: surgeries.surgeryType,
          isPrimarySurgery: surgeries.isPrimarySurgery,
          surgeonName: surgeries.surgeonName,
          complications: surgeries.complications,
          dischargeCondition: surgeries.dischargeCondition,
          syncStatus: surgeries.syncStatus,
          patientFirstName: patients.firstName,
          patientLastName: patients.lastName,
        })
        .from(surgeries)
        .leftJoin(patients, eq(surgeries.patientId, patients.id))
        .orderBy(desc(surgeries.surgeryDate))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(surgeries),
    ]);

    return addSecurityHeaders(
      NextResponse.json({
        surgeries: surgeryList,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.count || 0,
          totalPages: Math.ceil((totalCount[0]?.count || 0) / limit),
        },
      })
    );
  } catch (error) {
    console.error("Error fetching surgeries:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to fetch surgeries" }, { status: 500 })
    );
  }
}

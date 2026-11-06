import { NextRequest, NextResponse } from "next/server";
import { db, surgeries, patients } from "@/db";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { createSurgerySchema } from "@/lib/schemas";
import { enqueue, syncSoon } from "@/lib/sync";
import { desc, eq, count } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "surgeries.create");
    if (user instanceof NextResponse) return user;

    const d = createSurgerySchema.parse(sanitizeObject(await request.json()));
    const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, d.patientId)).limit(1);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const [row] = await db
      .insert(surgeries)
      .values({
        patientId: d.patientId,
        surgeryDate: d.surgeryDate,
        surgeryType: d.surgeryType,
        isPrimarySurgery: d.isPrimarySurgery,
        procedureDescription: d.procedureDescription || null,
        surgeonName: d.surgeonName || `${user.firstName} ${user.lastName}`,
        surgeonUserId: user.id,
        durationMinutes: d.durationMinutes,
        complications: d.complications,
        complicationsDetails: d.complicationsDetails || null,
        dischargeDate: d.dischargeDate || null,
        dischargeCondition: d.dischargeCondition || null,
        origin: "local",
        syncStatus: "pending",
      })
      .returning();

    await enqueue("surgeries", row.localId);
    await logAudit({ userId: user.id, action: "create_surgery", tableName: "surgeries", recordId: row.id, newValues: { localId: row.localId, patientId: d.patientId } });
    syncSoon();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to record surgery");
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("surgeries.view");
    if (user instanceof NextResponse) return user;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 100);
    const [list, total] = await Promise.all([
      db
        .select({
          id: surgeries.id, localId: surgeries.localId, patientId: surgeries.patientId, surgeryDate: surgeries.surgeryDate,
          surgeryType: surgeries.surgeryType, isPrimarySurgery: surgeries.isPrimarySurgery, surgeonName: surgeries.surgeonName,
          complications: surgeries.complications, dischargeCondition: surgeries.dischargeCondition, syncStatus: surgeries.syncStatus,
          origin: surgeries.origin, patientFirstName: patients.firstName, patientLastName: patients.lastName,
        })
        .from(surgeries)
        .leftJoin(patients, eq(surgeries.patientId, patients.id))
        .orderBy(desc(surgeries.surgeryDate))
        .limit(limit)
        .offset((page - 1) * limit),
      db.select({ count: count() }).from(surgeries),
    ]);
    const n = total[0]?.count || 0;
    return NextResponse.json({ surgeries: list, pagination: { page, limit, total: n, totalPages: Math.ceil(n / limit) } });
  } catch (error) {
    return apiError(error, "Failed to fetch surgeries");
  }
}

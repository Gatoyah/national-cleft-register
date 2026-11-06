import { NextRequest, NextResponse } from "next/server";
import { db, appointments, patients } from "@/db";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, isoDate, optionalText } from "@/lib/api";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";

const createAppointmentSchema = z.object({
  patientId: z.coerce.number().int().positive("Patient ID is required"),
  scheduledDate: isoDate,
  scheduledTime: optionalText(10),
  visitType: z.enum(["scheduled", "unscheduled", "outreach", "telehealth"]),
  appointmentType: optionalText(100),
  department: optionalText(100),
  notes: optionalText(5000),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "appointments.create");
    if (user instanceof NextResponse) return user;

    const d = createAppointmentSchema.parse(sanitizeObject(await request.json()));
    const [patient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.id, d.patientId)).limit(1);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const [row] = await db
      .insert(appointments)
      .values({
        patientId: d.patientId,
        scheduledDate: d.scheduledDate,
        scheduledTime: d.scheduledTime || null,
        visitType: d.visitType,
        appointmentType: d.appointmentType || null,
        department: d.department || null,
        notes: d.notes || null,
        status: "scheduled",
        facilityId: user.facilityId,
        createdByUserId: user.id,
      })
      .returning();

    await logAudit({ userId: user.id, action: "create_appointment", tableName: "appointments", recordId: row.id, newValues: { patientId: d.patientId, scheduledDate: d.scheduledDate } });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return apiError(error, "Failed to create appointment");
  }
}

export async function GET() {
  try {
    const user = await requirePermission("appointments.view");
    if (user instanceof NextResponse) return user;
    return NextResponse.json(await db.select().from(appointments).orderBy(desc(appointments.scheduledDate)).limit(200));
  } catch (error) {
    return apiError(error, "Failed to fetch appointments");
  }
}

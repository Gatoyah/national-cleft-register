import { NextRequest, NextResponse } from "next/server";
import { db, appointments } from "@/db";
import { requireAuth, requireRole, getSessionToken } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { validateCsrfToken } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { desc } from "drizzle-orm";

const createAppointmentSchema = z.object({
  patientId: z.coerce.number().min(1, "Patient ID is required"),
  scheduledDate: z.string().min(1, "Date is required"),
  scheduledTime: z.string().optional(),
  visitType: z.enum(["scheduled", "unscheduled", "outreach", "telehealth"]),
  appointmentType: z.string().optional(),
  department: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("admin", "clinician", "surgeon", "data_clerk");
    if (user instanceof NextResponse) return user;

    // Validate CSRF token
    const csrfToken = request.headers.get("x-csrf-token");
    const sessionToken = await getSessionToken();
    if (!csrfToken || !sessionToken || !validateCsrfToken(csrfToken, sessionToken)) {
      return NextResponse.json(
        { error: "Invalid or missing CSRF token" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const sanitizedBody = sanitizeObject(body);
    const validatedData = createAppointmentSchema.parse(sanitizedBody);

    const [newAppointment] = await db
      .insert(appointments)
      .values({
        patientId: validatedData.patientId,
        scheduledDate: validatedData.scheduledDate,
        scheduledTime: validatedData.scheduledTime || null,
        visitType: validatedData.visitType,
        appointmentType: validatedData.appointmentType || null,
        department: validatedData.department || null,
        notes: validatedData.notes || null,
        status: "scheduled",
        createdByUserId: user.id,
      })
      .returning();

    // Log action to audit log
    await logAudit({
      userId: user.id,
      action: "create_appointment",
      tableName: "appointments",
      recordId: newAppointment.id,
      newValues: sanitizedBody,
    });

    return NextResponse.json(newAppointment, { status: 201 });
  } catch (error) {
    console.error("Error creating appointment:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create appointment" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await requireAuth();
    if (user instanceof NextResponse) return user;

    const appointmentList = await db
      .select()
      .from(appointments)
      .orderBy(desc(appointments.scheduledDate))
      .limit(100);

    return NextResponse.json(appointmentList);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return NextResponse.json(
      { error: "Failed to fetch appointments" },
      { status: 500 }
    );
  }
}

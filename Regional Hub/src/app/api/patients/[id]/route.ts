import { NextRequest, NextResponse } from "next/server";
import { db, patients } from "@/db";
import { eq } from "drizzle-orm";
import { requirePermission, requireMutation } from "@/lib/auth";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { apiError, parseId } from "@/lib/api";
import { createPatientSchema } from "@/lib/schemas";
import { enqueue, syncSoon } from "@/lib/sync";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requirePermission("patients.view");
    if (user instanceof NextResponse) return user;
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    const [patient] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    return NextResponse.json(patient);
  } catch (error) {
    return apiError(error, "Failed to fetch patient");
  }
}

const updateSchema = createPatientSchema.omit({ cleftType: true, lipLaterality: true }).partial().extend({
  isDeceased: z.boolean().optional(),
  deceasedDate: z.string().max(10).optional().nullable(),
});

/** Edit a patient; the change is queued and sent to the Main Hub on the next sync. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireMutation(request, "patients.edit");
    if (user instanceof NextResponse) return user;
    const id = parseId((await params).id);
    if (!id) return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    const [existing] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    const body = sanitizeObject(await request.json());
    const parsed = updateSchema.parse(body);
    // Only change fields that were actually sent: schema transforms would otherwise
    // turn missing fields into false/null and silently wipe consent flags or GPS.
    const data = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in body)) as typeof parsed;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
    const [updated] = await db
      .update(patients)
      .set({ ...data, syncStatus: "pending", updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    await enqueue("patients", existing.localId, "update");

    const changed = Object.keys(data) as (keyof typeof existing)[];
    await logAudit({
      userId: user.id, action: "update_patient", tableName: "patients", recordId: id,
      oldValues: Object.fromEntries(changed.map((k) => [k, existing[k]])),
      newValues: Object.fromEntries(changed.map((k) => [k, updated[k]])),
    });
    syncSoon();
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error, "Failed to update patient");
  }
}

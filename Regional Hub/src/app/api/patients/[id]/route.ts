import { NextRequest, NextResponse } from "next/server";
import { db, patients } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { addSecurityHeaders } from "@/lib/security";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }

    const { id } = await params;
    const patientId = parseInt(id, 10);

    if (isNaN(patientId)) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Invalid patient ID" }, { status: 400 })
      );
    }

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!patient) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Patient not found" }, { status: 404 })
      );
    }

    return addSecurityHeaders(NextResponse.json(patient));
  } catch (error) {
    console.error("Error fetching patient:", error);
    return addSecurityHeaders(
      NextResponse.json({ error: "Failed to fetch patient" }, { status: 500 })
    );
  }
}

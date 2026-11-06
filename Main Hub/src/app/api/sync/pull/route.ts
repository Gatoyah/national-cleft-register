import { NextRequest, NextResponse } from "next/server";
import { db, patients, surgeries } from "@/db";
import { and, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { authenticateSync } from "@/lib/sync-auth";
import { apiError } from "@/lib/api";

/**
 * GET /api/sync/pull?since=<ISO timestamp>
 *
 * Gives a Regional Hub the Main Hub's view of the patients THAT HUB registered:
 *  - official NCR IDs and status changes (deceased, lost to follow-up), and
 *  - surgeries recorded for them elsewhere (e.g. at the Main Hub after referral).
 * A hub never receives patients registered by other facilities.
 * Use the returned `serverTime` as `since` next time.
 */
export async function GET(request: NextRequest) {
  try {
    const facility = await authenticateSync(request);
    if (facility instanceof NextResponse) return facility;

    const sinceRaw = request.nextUrl.searchParams.get("since");
    const sinceParsed = sinceRaw ? new Date(sinceRaw) : new Date(0);
    const since = Number.isNaN(sinceParsed.getTime()) ? new Date(0) : sinceParsed;
    const serverTime = new Date();

    const patientRows = await db
      .select({
        id: patients.id,
        localId: patients.sourceLocalId,
        ncrId: patients.ncrId,
        isDeceased: patients.isDeceased,
        deceasedDate: patients.deceasedDate,
        isLostToFollowUp: patients.isLostToFollowUp,
        updatedAt: patients.updatedAt,
      })
      .from(patients)
      .where(and(eq(patients.registeredAtFacilityId, facility.id), gte(patients.updatedAt, since)))
      .limit(1000);

    // Surgeries for this hub's patients that did NOT originate from this hub.
    const ownPatients = await db
      .select({ id: patients.id, localId: patients.sourceLocalId })
      .from(patients)
      .where(eq(patients.registeredAtFacilityId, facility.id));
    const localIdByPatient = new Map(ownPatients.map((p) => [p.id, p.localId]));

    const surgeryRows = ownPatients.length
      ? await db
          .select({
            id: surgeries.id,
            patientId: surgeries.patientId,
            surgeryDate: surgeries.surgeryDate,
            surgeryType: surgeries.surgeryType,
            isPrimarySurgery: surgeries.isPrimarySurgery,
            procedureDescription: surgeries.procedureDescription,
            surgeonName: surgeries.surgeonName,
            durationMinutes: surgeries.durationMinutes,
            complications: surgeries.intraopComplications,
            complicationsDetails: surgeries.intraopComplicationsDetails,
            dischargeDate: surgeries.dischargeDate,
            dischargeCondition: surgeries.dischargeCondition,
            updatedAt: surgeries.updatedAt,
          })
          .from(surgeries)
          .where(
            and(
              inArray(surgeries.patientId, [...localIdByPatient.keys()]),
              or(isNull(surgeries.sourceFacilityId), ne(surgeries.sourceFacilityId, facility.id)),
              gte(surgeries.updatedAt, since)
            )
          )
          .limit(1000)
      : [];

    await logAudit({ userId: null, action: "sync_pull", tableName: "facilities", recordId: facility.id, newValues: { facility: facility.code, patients: patientRows.length, surgeries: surgeryRows.length } });

    return NextResponse.json({
      success: true,
      serverTime: serverTime.toISOString(),
      facility: { id: facility.id, code: facility.code, name: facility.name },
      data: {
        patients: patientRows.filter((p) => p.localId),
        surgeries: surgeryRows.map((s) => ({ ...s, remoteId: `mh-${s.id}`, patientLocalId: localIdByPatient.get(s.patientId) })),
      },
    });
  } catch (error) {
    return apiError(error, "Failed to pull data");
  }
}

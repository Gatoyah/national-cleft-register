import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db, patients, diagnoses, surgeries, facilities } from "@/db";
import { requireAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requireHexSecret } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { toCsv } from "@/lib/csv";

/**
 * GET /api/export?type=deidentified|full&dataset=patients|surgeries
 *
 * - deidentified (researcher, admin): ONLY patients who consented to research.
 *   No names, phone numbers, ID numbers, exact birth dates, towns or GPS.
 *   Each patient gets a stable pseudonymous research ID (HMAC of the NCR ID).
 * - full (admin only): complete identifiable dataset, e.g. for backups or
 *   ministry reporting. Every export is written to the audit log.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (user instanceof NextResponse) return user;

    const type = request.nextUrl.searchParams.get("type") === "full" ? "full" : "deidentified";
    const dataset = request.nextUrl.searchParams.get("dataset") === "surgeries" ? "surgeries" : "patients";
    const permission = type === "full" ? "export.full" : "export.deidentified";
    if (!hasPermission(user.role, permission)) {
      return NextResponse.json({ error: "Insufficient permissions for this export." }, { status: 403 });
    }

    const pseudonymKey = requireHexSecret("CSRF_SECRET");
    const researchId = (ncrId: string) =>
      "R-" + crypto.createHmac("sha256", `research:${pseudonymKey}`).update(ncrId).digest("hex").slice(0, 12).toUpperCase();

    const [allPatients, allDiagnoses, allSurgeries, allFacilities] = await Promise.all([
      db.select().from(patients),
      db.select().from(diagnoses),
      db.select().from(surgeries),
      db.select({ id: facilities.id, code: facilities.code }).from(facilities),
    ]);
    const facilityCode = new Map(allFacilities.map((f) => [f.id, f.code]));
    const primaryDx = new Map<number, typeof allDiagnoses[number]>();
    for (const d of allDiagnoses) {
      if (!primaryDx.has(d.patientId) || d.isPrimaryDiagnosis) primaryDx.set(d.patientId, d);
    }
    const surgeriesByPatient = new Map<number, typeof allSurgeries>();
    for (const s of allSurgeries) {
      const list = surgeriesByPatient.get(s.patientId) ?? [];
      list.push(s);
      surgeriesByPatient.set(s.patientId, list);
    }

    const included = type === "full" ? allPatients : allPatients.filter((p) => p.consentResearch);
    const includedIds = new Set(included.map((p) => p.id));
    const patientById = new Map(allPatients.map((p) => [p.id, p]));
    const daysBetween = (from: string, to: string | null) =>
      to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) : null;

    let rows: Record<string, unknown>[];
    if (dataset === "patients") {
      rows = included.map((p) => {
        const dx = primaryDx.get(p.id);
        const ss = surgeriesByPatient.get(p.id) ?? [];
        const firstSurgery = ss.map((s) => s.surgeryDate).sort()[0] ?? null;
        const common = {
          sex: p.sex,
          region: p.regionOfResidence,
          registered_facility: facilityCode.get(p.registeredAtFacilityId ?? -1) ?? "",
          cleft_type: dx?.cleftType ?? "",
          lip_laterality: dx?.lipLaterality ?? "",
          palate_type: dx?.palateType ?? "",
          associated_anomalies: dx?.hasAssociatedAnomalies ?? "",
          age_at_diagnosis_days: dx ? daysBetween(p.dateOfBirth, dx.diagnosisDate) : "",
          surgery_count: ss.length,
          age_at_first_surgery_days: daysBetween(p.dateOfBirth, firstSurgery),
          any_complications: ss.some((s) => s.intraopComplications),
          is_deceased: p.isDeceased,
          lost_to_follow_up: p.isLostToFollowUp,
        };
        return type === "full"
          ? {
              ncr_id: p.ncrId, first_name: p.firstName, middle_name: p.middleName, last_name: p.lastName,
              date_of_birth: p.dateOfBirth, ghana_card_number: p.ghanaCardNumber, nhis_number: p.nhisNumber,
              district: p.districtOfResidence, town_village: p.townVillage,
              caregiver_name: p.caregiverName, caregiver_phone: p.caregiverPhone,
              consent_research: p.consentResearch, consent_data_sharing: p.consentDataSharing,
              ...common, created_at: p.createdAt,
            }
          : { research_id: researchId(p.ncrId), birth_year: p.dateOfBirth.slice(0, 4), ...common };
      });
    } else {
      rows = allSurgeries
        .filter((s) => includedIds.has(s.patientId))
        .map((s) => {
          const p = patientById.get(s.patientId)!;
          const common = {
            surgery_type: s.surgeryType,
            is_primary: s.isPrimarySurgery,
            age_at_surgery_days: daysBetween(p.dateOfBirth, s.surgeryDate),
            lip_technique: s.lipTechnique, palate_technique: s.palateTechnique,
            duration_minutes: s.durationMinutes, blood_loss_ml: s.bloodLossMl,
            complications: s.intraopComplications, icu_admission: s.icuAdmission,
            length_of_stay_days: s.lengthOfStayDays ?? daysBetween(s.surgeryDate, s.dischargeDate),
            discharge_condition: s.dischargeCondition,
            facility: facilityCode.get(s.facilityId ?? -1) ?? "",
          };
          return type === "full"
            ? { ncr_id: p.ncrId, surgery_date: s.surgeryDate, surgeon_name: s.surgeonName, ...common }
            : { research_id: researchId(p.ncrId), surgery_year: s.surgeryDate.slice(0, 4), ...common };
        });
    }

    await logAudit({ userId: user.id, action: `export_${type}_${dataset}`, tableName: dataset, newValues: { rows: rows.length } });

    const filename = `ncr-${dataset}-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, "Export failed");
  }
}

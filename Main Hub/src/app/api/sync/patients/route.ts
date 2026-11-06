import { NextRequest, NextResponse } from "next/server";
import { db, patients, diagnoses } from "@/db";
import { and, eq } from "drizzle-orm";
import { sanitizeObject } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { withNcrId } from "@/lib/ncr-id";
import { authenticateSync, MAX_BATCH } from "@/lib/sync-auth";
import { apiError, REGIONS, isoDate } from "@/lib/api";
import { z } from "zod";

const text = (max = 255) => z.string().max(max).nullable().optional();
const laterality = z.enum(["unilateral_left", "unilateral_right", "bilateral", "midline"]).nullable().optional();

const diagnosisSchema = z.object({
  localId: z.string().min(1).max(64),
  diagnosisDate: isoDate,
  cleftType: z.enum(["cleft_lip_only", "cleft_palate_only", "cleft_lip_and_palate"]),
  diagnosedAntenatally: z.boolean().nullable().optional(),
  diagnosedAtBirth: z.boolean().nullable().optional(),
  lipInvolved: z.boolean().nullable().optional(),
  lipLaterality: laterality,
  lipComplete: z.boolean().nullable().optional(),
  alveolarInvolved: z.boolean().nullable().optional(),
  palateInvolved: z.boolean().nullable().optional(),
  palateType: z.enum(["soft", "hard", "soft_and_hard", "submucous"]).nullable().optional(),
  lahsalCode: text(20),
  hasAssociatedAnomalies: z.boolean().nullable().optional(),
  associatedAnomaliesDetails: text(5000),
});

const patientSchema = z.object({
  localId: z.string().min(1).max(64),
  firstName: z.string().min(1).max(100),
  middleName: text(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: isoDate,
  sex: z.enum(["male", "female", "intersex"]),
  placeOfBirth: text(),
  regionOfResidence: z.enum(REGIONS),
  districtOfResidence: text(100),
  townVillage: text(),
  gpsLatitude: z.number().min(-90).max(90).nullable().optional(),
  gpsLongitude: z.number().min(-180).max(180).nullable().optional(),
  caregiverName: z.string().min(1).max(255),
  caregiverRelationship: text(50),
  caregiverPhone: text(20),
  caregiverPhone2: text(20),
  isDeceased: z.boolean().nullable().optional(),
  deceasedDate: text(10),
  consentClinicalCare: z.boolean().nullable().optional(),
  consentResearch: z.boolean().nullable().optional(),
  consentDataSharing: z.boolean().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  diagnoses: z.array(diagnosisSchema).max(20).optional(),
});

const envelope = z.object({
  facilityCode: z.string().max(20).optional(),
  facilityApiKey: z.string().optional(),
  patients: z.array(z.unknown()).max(MAX_BATCH),
});

type ItemResult = {
  localId: string;
  status: "created" | "updated" | "error";
  id?: number;
  ncrId?: string;
  error?: string;
};

const toDate = (v?: string) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date();
};

/**
 * POST /api/sync/patients — a Regional Hub uploads its patients (with their diagnoses).
 * Idempotent: re-sending the same record never creates a duplicate.
 * Each record succeeds or fails on its own; the response lists a result per record.
 */
export async function POST(request: NextRequest) {
  try {
    const body = envelope.parse(await request.json());
    const facility = await authenticateSync(request, body);
    if (facility instanceof NextResponse) return facility;

    const items: ItemResult[] = [];
    let created = 0, updated = 0;

    for (const raw of body.patients) {
      const parsed = patientSchema.safeParse(sanitizeObject((raw ?? {}) as Record<string, unknown>));
      const localId = typeof (raw as { localId?: unknown })?.localId === "string" ? (raw as { localId: string }).localId : "?";
      if (!parsed.success) {
        items.push({ localId, status: "error", error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        continue;
      }
      const p = parsed.data;
      try {
        const fields = {
          firstName: p.firstName,
          middleName: p.middleName || null,
          lastName: p.lastName,
          dateOfBirth: p.dateOfBirth,
          sex: p.sex,
          placeOfBirth: p.placeOfBirth || null,
          regionOfResidence: p.regionOfResidence,
          districtOfResidence: p.districtOfResidence || null,
          townVillage: p.townVillage || null,
          gpsLatitude: p.gpsLatitude ?? null,
          gpsLongitude: p.gpsLongitude ?? null,
          caregiverName: p.caregiverName,
          caregiverRelationship: p.caregiverRelationship || null,
          caregiverPhone: p.caregiverPhone || null,
          caregiverPhone2: p.caregiverPhone2 || null,
          isDeceased: !!p.isDeceased,
          deceasedDate: p.deceasedDate || null,
          ...(p.consentClinicalCare != null ? { consentClinicalCare: p.consentClinicalCare } : {}),
          ...(p.consentResearch != null ? { consentResearch: p.consentResearch } : {}),
          ...(p.consentDataSharing != null ? { consentDataSharing: p.consentDataSharing } : {}),
        };

        const [existing] = await db
          .select({ id: patients.id, ncrId: patients.ncrId, updatedAt: patients.updatedAt })
          .from(patients)
          .where(and(eq(patients.registeredAtFacilityId, facility.id), eq(patients.sourceLocalId, p.localId)))
          .limit(1);

        let id: number, ncrId: string, status: ItemResult["status"];
        if (existing) {
          id = existing.id;
          ncrId = existing.ncrId;
          // The hub that registered a patient owns their demographics, and it only
          // queues records that really changed — so always apply its version (no
          // wall-clock comparison: hospital PCs' clocks can be wrong). "Deceased"
          // can be set on either side, so it is merged and never reverted.
          const [current] = await db.select({ isDeceased: patients.isDeceased, deceasedDate: patients.deceasedDate }).from(patients).where(eq(patients.id, id)).limit(1);
          await db
            .update(patients)
            .set({
              ...fields,
              isDeceased: !!current?.isDeceased || fields.isDeceased,
              deceasedDate: fields.deceasedDate || current?.deceasedDate || null,
              updatedAt: new Date(),
            })
            .where(eq(patients.id, id));
          status = "updated";
          updated++;
        } else {
          const row = await withNcrId(async (newNcrId) => {
            const [r] = await db
              .insert(patients)
              .values({
                ...fields,
                ncrId: newNcrId,
                sourceLocalId: p.localId,
                registeredAtFacilityId: facility.id,
                currentFacilityId: facility.id,
                createdAt: toDate(p.createdAt),
                updatedAt: toDate(p.updatedAt),
              })
              .returning({ id: patients.id, ncrId: patients.ncrId });
            return r;
          });
          id = row.id;
          ncrId = row.ncrId;
          status = "created";
          created++;
          await logAudit({ userId: null, action: "sync_create_patient", tableName: "patients", recordId: id, newValues: { ncrId, localId: p.localId, facility: facility.code } });
        }

        for (const d of p.diagnoses ?? []) {
          const values = {
            patientId: id,
            diagnosisDate: d.diagnosisDate,
            cleftType: d.cleftType,
            diagnosedAntenatally: !!d.diagnosedAntenatally,
            diagnosedAtBirth: !!d.diagnosedAtBirth,
            lipInvolved: d.lipInvolved ?? d.cleftType !== "cleft_palate_only",
            lipLaterality: d.lipLaterality ?? null,
            lipComplete: d.lipComplete ?? null,
            alveolarInvolved: !!d.alveolarInvolved,
            palateInvolved: d.palateInvolved ?? d.cleftType !== "cleft_lip_only",
            palateType: d.palateType ?? null,
            lahsalCode: d.lahsalCode || null,
            hasAssociatedAnomalies: !!d.hasAssociatedAnomalies,
            associatedAnomaliesDetails: d.associatedAnomaliesDetails || null,
            diagnosedAtFacilityId: facility.id,
            sourceFacilityId: facility.id,
            sourceLocalId: d.localId,
            updatedAt: new Date(),
          };
          await db
            .insert(diagnoses)
            .values(values)
            .onConflictDoUpdate({ target: [diagnoses.sourceFacilityId, diagnoses.sourceLocalId], set: values });
        }

        items.push({ localId: p.localId, status, id, ncrId });
      } catch (err) {
        console.error(`sync patient ${p.localId} failed`, err);
        items.push({ localId: p.localId, status: "error", error: "Server could not save this record" });
      }
    }

    const errors = items.filter((i) => i.status === "error");
    await logAudit({ userId: null, action: "sync_patients", tableName: "patients", newValues: { facility: facility.code, received: body.patients.length, created, updated, errors: errors.length } });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        received: body.patients.length,
        created,
        updated,
        errors: errors.map((e) => `${e.localId}: ${e.error}`),
        // Kept for older Regional Hubs that read results.patients
        patients: items.filter((i) => i.status !== "error").map((i) => ({ localId: i.localId, id: i.id, ncrId: i.ncrId })),
        items,
      },
    });
  } catch (error) {
    return apiError(error, "Sync failed");
  }
}

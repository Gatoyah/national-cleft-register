import { z } from "zod";
import { REGIONS, isoDate, optionalText } from "@/lib/api";

const coord = (min: number, max: number) =>
  z.union([z.coerce.number().min(min).max(max), z.literal("")]).optional().nullable()
    .transform((v) => (v === "" || v === undefined ? null : v));
const optEnum = <T extends z.ZodTypeAny>(e: T) => z.union([e, z.literal("")]).optional().nullable().transform((v) => (v ? v : null));
const checkbox = z.union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false")]).optional()
  .transform((v) => v === true || v === "on" || v === "true");

export const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  middleName: optionalText(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  dateOfBirth: isoDate.refine((v) => new Date(v) <= new Date(), "Date of birth cannot be in the future"),
  sex: z.enum(["male", "female", "intersex"]),
  placeOfBirth: optionalText(),
  regionOfResidence: z.enum(REGIONS),
  districtOfResidence: optionalText(100),
  townVillage: optionalText(),
  gpsLatitude: coord(-90, 90),
  gpsLongitude: coord(-180, 180),
  caregiverName: z.string().min(1, "Caregiver name is required").max(255),
  caregiverRelationship: optionalText(50),
  caregiverPhone: optionalText(20),
  caregiverPhone2: optionalText(20),
  consentClinicalCare: checkbox,
  consentResearch: checkbox,
  consentDataSharing: checkbox,
  cleftType: optEnum(z.enum(["cleft_lip_only", "cleft_palate_only", "cleft_lip_and_palate"])),
  lipLaterality: optEnum(z.enum(["unilateral_left", "unilateral_right", "bilateral", "midline"])),
});

export const createSurgerySchema = z.object({
  patientId: z.coerce.number().int().positive(),
  surgeryDate: isoDate,
  surgeryType: z.enum([
    "primary_lip_repair", "primary_palate_repair", "secondary_lip_revision",
    "alveolar_bone_graft", "pharyngoplasty", "fistula_repair", "rhinoplasty", "other",
  ]),
  isPrimarySurgery: checkbox,
  procedureDescription: optionalText(5000),
  surgeonName: optionalText(),
  durationMinutes: z.union([z.coerce.number().int().min(0).max(2000), z.literal("")]).optional().nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  complications: checkbox,
  complicationsDetails: optionalText(5000),
  dischargeDate: z.union([isoDate, z.literal("")]).optional().nullable(),
  dischargeCondition: optionalText(50),
});

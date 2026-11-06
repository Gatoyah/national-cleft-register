import { z } from "zod";
import { REGIONS, isoDate, optionalIsoDate, optionalText } from "@/lib/api";

const coord = (min: number, max: number) =>
  z.union([z.coerce.number().min(min).max(max), z.literal("")]).optional().nullable()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  middleName: optionalText(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  dateOfBirth: isoDate.refine((v) => new Date(v) <= new Date(), "Date of birth cannot be in the future"),
  sex: z.enum(["male", "female", "intersex"]),
  placeOfBirth: optionalText(),
  ghanaCardNumber: optionalText(20),
  nhisNumber: optionalText(20),
  regionOfResidence: z.enum(REGIONS),
  districtOfResidence: optionalText(100),
  townVillage: optionalText(),
  gpsLatitude: coord(-90, 90),
  gpsLongitude: coord(-180, 180),
  caregiverName: z.string().min(1, "Caregiver name is required").max(255),
  caregiverRelationship: optionalText(50),
  caregiverPhone: optionalText(20),
  caregiverPhone2: optionalText(20),
  caregiverOccupation: optionalText(100),
  consentClinicalCare: z.coerce.boolean().optional(),
  consentPhotography: z.coerce.boolean().optional(),
  consentResearch: z.coerce.boolean().optional(),
  consentDataSharing: z.coerce.boolean().optional(),
  consentDate: optionalIsoDate,
  consentWitnessName: optionalText(),
});


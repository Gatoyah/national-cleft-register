import {
  sqliteTable as pgTable,
  integer as serial,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

function varchar<TName extends string>(name: TName, options?: any) {
  return text(name);
}

function boolean<TName extends string>(name: TName) {
  return integer(name, { mode: "boolean" });
}

function timestamp<TName extends string>(name: TName) {
  return integer(name, { mode: "timestamp" });
}

function date<TName extends string>(name: TName) {
  return text(name);
}

function decimal<TName extends string>(name: TName, options?: any) {
  return real(name);
}

function jsonb<TName extends string>(name: TName) {
  return text(name, { mode: "json" });
}

function pgEnum<TEnumName extends string>(name: TEnumName, values: readonly string[]) {
  return <TName extends string>(columnName: TName) => text(columnName);
}

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "clinician",
  "surgeon",
  "data_clerk",
  "researcher",
  "viewer",
  "community_health_worker",
]);

export const regionEnum = pgEnum("region", [
  "ashanti",
  "greater_accra",
  "northern",
  "western",
  "eastern",
  "central",
  "volta",
  "upper_east",
  "upper_west",
  "bono",
  "bono_east",
  "ahafo",
  "western_north",
  "oti",
  "north_east",
  "savannah",
]);

export const facilityTypeEnum = pgEnum("facility_type", [
  "hub",
  "co_hub",
  "regional_centre",
  "district_hospital",
  "chps_compound",
  "ngo",
  "mission_hospital",
]);

export const cleftTypeEnum = pgEnum("cleft_type", [
  "cleft_lip_only",
  "cleft_palate_only",
  "cleft_lip_and_palate",
]);

export const lateralityEnum = pgEnum("laterality", [
  "unilateral_left",
  "unilateral_right",
  "bilateral",
  "midline",
]);

export const palateTypeEnum = pgEnum("palate_type", [
  "soft",
  "hard",
  "soft_and_hard",
  "submucous",
]);

export const veauClassEnum = pgEnum("veau_class", ["I", "II", "III", "IV"]);

export const feedingMethodEnum = pgEnum("feeding_method", [
  "breastfeeding",
  "cup",
  "spoon",
  "ng_tube",
  "bottle",
  "mixed",
]);

export const asaClassificationEnum = pgEnum("asa_classification", [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
]);

export const surgeryTypeEnum = pgEnum("surgery_type", [
  "primary_lip_repair",
  "primary_palate_repair",
  "secondary_lip_revision",
  "alveolar_bone_graft",
  "pharyngoplasty",
  "fistula_repair",
  "rhinoplasty",
  "other",
]);

export const techniqueLipEnum = pgEnum("technique_lip", [
  "millard",
  "tennison_randall",
  "fisher",
  "mohler",
  "other",
]);

export const techniquePalateEnum = pgEnum("technique_palate", [
  "bardach",
  "furlow",
  "von_langenbeck",
  "veau_wardill_kilner",
  "intravelar_veloplasty",
  "other",
]);

export const visitTypeEnum = pgEnum("visit_type", [
  "scheduled",
  "unscheduled",
  "outreach",
  "telehealth",
]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "completed",
  "missed",
  "cancelled",
  "rescheduled",
]);

export const researchStatusEnum = pgEnum("research_status", [
  "proposed",
  "ethics_pending",
  "ethics_approved",
  "active",
  "completed",
  "published",
]);

export const sexEnum = pgEnum("sex", ["male", "female", "intersex"]);

export const deliveryModeEnum = pgEnum("delivery_mode", [
  "vaginal",
  "caesarean",
  "assisted",
]);

export const birthAttendantEnum = pgEnum("birth_attendant", [
  "doctor",
  "midwife",
  "nurse",
  "tba",
  "none",
  "other",
]);

// ============================================================================
// SECTION 10: USERS & FACILITIES (Administration)
// ============================================================================

export const facilities = pgTable("facilities", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  facilityType: facilityTypeEnum("facility_type").notNull(),
  region: regionEnum("region").notNull(),
  district: varchar("district", { length: 100 }),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  gpsLatitude: decimal("gps_latitude", { precision: 10, scale: 7 }),
  gpsLongitude: decimal("gps_longitude", { precision: 10, scale: 7 }),
  hasInternet: boolean("has_internet").default(false),
  parentFacilityId: integer("parent_facility_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  role: userRoleEnum("role").notNull(),
  facilityId: integer("facility_id").references(() => facilities.id),
  phone: varchar("phone", { length: 20 }),
  professionalId: varchar("professional_id", { length: 50 }),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  mustChangePassword: boolean("must_change_password").default(false),
  passwordChangedAt: timestamp("password_changed_at"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: integer("record_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  facilityId: integer("facility_id")
    .references(() => facilities.id)
    .notNull(),
  keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(), // first 8 chars for identification
  label: varchar("label", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 1: PATIENT DEMOGRAPHICS & IDENTIFICATION
// ============================================================================

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  ncrId: varchar("ncr_id", { length: 20 }).notNull().unique(), // NCR-YYYY-NNNNN
  sourceLocalId: varchar("source_local_id", { length: 64 }), // Regional Hub's local ID, for sync lookups
  ghanaCardNumber: varchar("ghana_card_number", { length: 20 }),
  nhisNumber: varchar("nhis_number", { length: 20 }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  middleName: varchar("middle_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  sex: sexEnum("sex").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  placeOfBirth: varchar("place_of_birth", { length: 255 }),
  regionOfResidence: regionEnum("region_of_residence").notNull(),
  districtOfResidence: varchar("district_of_residence", { length: 100 }),
  townVillage: varchar("town_village", { length: 255 }),
  gpsLatitude: decimal("gps_latitude", { precision: 10, scale: 7 }),
  gpsLongitude: decimal("gps_longitude", { precision: 10, scale: 7 }),
  // Caregiver details
  caregiverName: varchar("caregiver_name", { length: 255 }).notNull(),
  caregiverRelationship: varchar("caregiver_relationship", { length: 50 }),
  caregiverPhone: varchar("caregiver_phone", { length: 20 }),
  caregiverPhone2: varchar("caregiver_phone_2", { length: 20 }),
  caregiverOccupation: varchar("caregiver_occupation", { length: 100 }),
  // Photos
  photoUrl: text("photo_url"),
  // Consent
  consentClinicalCare: boolean("consent_clinical_care").default(false),
  consentPhotography: boolean("consent_photography").default(false),
  consentResearch: boolean("consent_research").default(false),
  consentDataSharing: boolean("consent_data_sharing").default(false),
  consentDate: date("consent_date"),
  consentWitnessName: varchar("consent_witness_name", { length: 255 }),
  // Registration
  registeredByUserId: integer("registered_by_user_id").references(() => users.id),
  registeredAtFacilityId: integer("registered_at_facility_id").references(() => facilities.id),
  referredFromFacilityId: integer("referred_from_facility_id").references(() => facilities.id),
  currentFacilityId: integer("current_facility_id").references(() => facilities.id),
  // Status
  isDeceased: boolean("is_deceased").default(false),
  deceasedDate: date("deceased_date"),
  isLostToFollowUp: boolean("is_lost_to_follow_up").default(false),
  lostToFollowUpDate: date("lost_to_follow_up_date"),
  // Metadata
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 2: BIRTH & ANTENATAL HISTORY
// ============================================================================

export const birthHistory = pgTable("birth_history", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull()
    .unique(),
  // Maternal details
  maternalAge: integer("maternal_age"),
  parity: integer("parity"),
  gravidity: integer("gravidity"),
  // Antenatal care
  antenatalCareAttended: boolean("antenatal_care_attended"),
  antenatalVisitsCount: integer("antenatal_visits_count"),
  antenatalFacility: varchar("antenatal_facility", { length: 255 }),
  // Maternal illness
  maternalDiabetes: boolean("maternal_diabetes").default(false),
  maternalHypertension: boolean("maternal_hypertension").default(false),
  maternalInfections: boolean("maternal_infections").default(false),
  maternalInfectionsDetails: text("maternal_infections_details"),
  otherMaternalIllness: text("other_maternal_illness"),
  // Medication exposure
  folicAcidUse: boolean("folic_acid_use"),
  folicAcidTimingPreconception: boolean("folic_acid_timing_preconception"),
  anticonvulsantUse: boolean("anticonvulsant_use"),
  anticonvulsantDetails: text("anticonvulsant_details"),
  herbalMedicineUse: boolean("herbal_medicine_use"),
  herbalMedicineDetails: text("herbal_medicine_details"),
  otherMedications: text("other_medications"),
  // Lifestyle factors
  smokingDuringPregnancy: boolean("smoking_during_pregnancy").default(false),
  alcoholDuringPregnancy: boolean("alcohol_during_pregnancy").default(false),
  substanceUseDuringPregnancy: boolean("substance_use_during_pregnancy").default(false),
  substanceDetails: text("substance_details"),
  // Genetic factors
  consanguinity: boolean("consanguinity").default(false),
  consanguinityDetails: text("consanguinity_details"),
  familyHistoryCleft: boolean("family_history_cleft").default(false),
  familyHistoryCleftDetails: text("family_history_cleft_details"),
  familyHistoryOtherAnomalies: boolean("family_history_other_anomalies").default(false),
  familyHistoryOtherAnomaliesDetails: text("family_history_other_anomalies_details"),
  // Birth details
  deliveryMode: deliveryModeEnum("delivery_mode"),
  birthWeight: decimal("birth_weight", { precision: 5, scale: 3 }), // kg
  gestationalAge: integer("gestational_age"), // weeks
  birthAttendant: birthAttendantEnum("birth_attendant"),
  birthFacility: varchar("birth_facility", { length: 255 }),
  // Data entry
  enteredByUserId: integer("entered_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 3: DIAGNOSIS & CLEFT CLASSIFICATION
// ============================================================================

export const diagnoses = pgTable("diagnoses", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  // Timing
  diagnosisDate: date("diagnosis_date").notNull(),
  diagnosedAntenatally: boolean("diagnosed_antenatally").default(false),
  diagnosedAtBirth: boolean("diagnosed_at_birth").default(false),
  ageAtDiagnosisDays: integer("age_at_diagnosis_days"),
  // Cleft type
  cleftType: cleftTypeEnum("cleft_type").notNull(),
  // Lip details
  lipInvolved: boolean("lip_involved").default(false),
  lipLaterality: lateralityEnum("lip_laterality"),
  lipComplete: boolean("lip_complete"),
  // Alveolus details
  alveolarInvolved: boolean("alveolar_involved").default(false),
  alveolarLaterality: lateralityEnum("alveolar_laterality"),
  // Palate details
  palateInvolved: boolean("palate_involved").default(false),
  palateType: palateTypeEnum("palate_type"),
  veauClass: veauClassEnum("veau_class"),
  // LAHSAL code (comprehensive)
  lahsalCode: varchar("lahsal_code", { length: 20 }),
  // ICD codes
  icd10Code: varchar("icd10_code", { length: 10 }),
  icd11Code: varchar("icd11_code", { length: 20 }),
  // Associated conditions
  hasAssociatedAnomalies: boolean("has_associated_anomalies").default(false),
  pierreRobinSequence: boolean("pierre_robin_sequence").default(false),
  deletion22q11: boolean("deletion_22q11").default(false),
  otherSyndrome: varchar("other_syndrome", { length: 255 }),
  associatedAnomaliesDetails: text("associated_anomalies_details"),
  // Photos
  preOpPhotoFrontal: text("pre_op_photo_frontal"),
  preOpPhotoLateral: text("pre_op_photo_lateral"),
  preOpPhotoIntraoral: text("pre_op_photo_intraoral"),
  // Data entry
  diagnosedByUserId: integer("diagnosed_by_user_id").references(() => users.id),
  diagnosedAtFacilityId: integer("diagnosed_at_facility_id").references(() => facilities.id),
  isPrimaryDiagnosis: boolean("is_primary_diagnosis").default(true),
  // Sync provenance (records that came from a Regional Hub)
  sourceLocalId: varchar("source_local_id", { length: 64 }),
  sourceFacilityId: integer("source_facility_id").references(() => facilities.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 4: NUTRITIONAL STATUS & GROWTH TRACKING
// ============================================================================

export const nutritionAssessments = pgTable("nutrition_assessments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  // Measurements
  weightKg: decimal("weight_kg", { precision: 5, scale: 2 }),
  heightCm: decimal("height_cm", { precision: 5, scale: 1 }),
  muacCm: decimal("muac_cm", { precision: 4, scale: 1 }), // Mid-upper arm circumference
  headCircumferenceCm: decimal("head_circumference_cm", { precision: 4, scale: 1 }),
  // WHO Z-scores (auto-calculated or entered)
  weightForAgeZ: decimal("weight_for_age_z", { precision: 4, scale: 2 }),
  heightForAgeZ: decimal("height_for_age_z", { precision: 4, scale: 2 }),
  weightForHeightZ: decimal("weight_for_height_z", { precision: 4, scale: 2 }),
  bmiForAgeZ: decimal("bmi_for_age_z", { precision: 4, scale: 2 }),
  // Feeding
  feedingMethod: feedingMethodEnum("feeding_method"),
  breastfeedingExclusive: boolean("breastfeeding_exclusive"),
  feedingDifficulties: boolean("feeding_difficulties").default(false),
  feedingDifficultiesDetails: text("feeding_difficulties_details"),
  // Supplementation
  receivingSupplementation: boolean("receiving_supplementation").default(false),
  supplementationType: text("supplementation_type"),
  // Anaemia
  haemoglobinLevel: decimal("haemoglobin_level", { precision: 3, scale: 1 }),
  isAnaemic: boolean("is_anaemic"),
  // Clinical assessment
  malnutritionCategory: varchar("malnutrition_category", { length: 50 }),
  clinicalNotes: text("clinical_notes"),
  // Data entry
  assessedByUserId: integer("assessed_by_user_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 5: SURGICAL CARE & OPERATIVE RECORDS
// ============================================================================

export const surgeries = pgTable("surgeries", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  // Pre-operative
  preOpDate: date("pre_op_date"),
  preOpHaemoglobin: decimal("pre_op_haemoglobin", { precision: 3, scale: 1 }),
  bloodGroup: varchar("blood_group", { length: 5 }),
  asaClassification: asaClassificationEnum("asa_classification"),
  preOpWeight: decimal("pre_op_weight", { precision: 5, scale: 2 }),
  anaesthesiaReviewCompleted: boolean("anaesthesia_review_completed").default(false),
  safetyChecklistCompleted: boolean("safety_checklist_completed").default(false),
  fitForSurgery: boolean("fit_for_surgery"),
  preOpNotes: text("pre_op_notes"),
  // Surgery details
  surgeryDate: date("surgery_date").notNull(),
  surgeryType: surgeryTypeEnum("surgery_type").notNull(),
  isPrimarySurgery: boolean("is_primary_surgery").default(true),
  surgerySequenceNumber: integer("surgery_sequence_number").default(1),
  procedureDescription: text("procedure_description"),
  // Technique
  lipTechnique: techniqueLipEnum("lip_technique"),
  palateTechnique: techniquePalateEnum("palate_technique"),
  otherTechniqueDetails: text("other_technique_details"),
  // Timing
  surgeryStartTime: timestamp("surgery_start_time"),
  surgeryEndTime: timestamp("surgery_end_time"),
  durationMinutes: integer("duration_minutes"),
  anaesthesiaType: varchar("anaesthesia_type", { length: 100 }),
  // Team
  primarySurgeonId: integer("primary_surgeon_id").references(() => users.id),
  assistantSurgeonId: integer("assistant_surgeon_id").references(() => users.id),
  anaesthetistId: integer("anaesthetist_id").references(() => users.id),
  // Intraoperative
  bloodLossMl: integer("blood_loss_ml"),
  bloodTransfusion: boolean("blood_transfusion").default(false),
  transfusionVolumeMl: integer("transfusion_volume_ml"),
  intraopComplications: boolean("intraop_complications").default(false),
  intraopComplicationsDetails: text("intraop_complications_details"),
  // Post-operative immediate
  icuAdmission: boolean("icu_admission").default(false),
  icuDays: integer("icu_days"),
  postOpNotes: text("post_op_notes"),
  // Discharge
  dischargeDate: date("discharge_date"),
  lengthOfStayDays: integer("length_of_stay_days"),
  dischargeCondition: varchar("discharge_condition", { length: 50 }),
  dischargeInstructions: text("discharge_instructions"),
  // Photos
  immediatePostOpPhoto: text("immediate_post_op_photo"),
  // Facility
  facilityId: integer("facility_id").references(() => facilities.id),
  surgeonName: varchar("surgeon_name", { length: 255 }),
  // Sync provenance (records that came from a Regional Hub)
  sourceLocalId: varchar("source_local_id", { length: 64 }),
  sourceFacilityId: integer("source_facility_id").references(() => facilities.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const surgicalComplications = pgTable("surgical_complications", {
  id: serial("id").primaryKey(),
  surgeryId: integer("surgery_id")
    .references(() => surgeries.id)
    .notNull(),
  complicationType: varchar("complication_type", { length: 100 }).notNull(),
  complicationDate: date("complication_date"),
  severity: varchar("severity", { length: 20 }),
  managementDescription: text("management_description"),
  resolved: boolean("resolved").default(false),
  resolvedDate: date("resolved_date"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 6: COMPREHENSIVE CARE TRACKING
// ============================================================================

export const speechAssessments = pgTable("speech_assessments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  assessorId: integer("assessor_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  // Assessment type
  assessmentType: varchar("assessment_type", { length: 50 }),
  // Resonance
  hypernasality: varchar("hypernasality", { length: 20 }),
  hyponasality: varchar("hyponasality", { length: 20 }),
  nasalEmission: boolean("nasal_emission"),
  // Articulation
  articulationErrors: boolean("articulation_errors"),
  articulationDetails: text("articulation_details"),
  compensatoryArticulation: boolean("compensatory_articulation"),
  // Intelligibility
  intelligibilityRating: integer("intelligibility_rating"), // 1-5 scale
  capsAScore: decimal("caps_a_score", { precision: 4, scale: 2 }),
  // Recommendations
  therapyRecommended: boolean("therapy_recommended"),
  surgeryRecommended: boolean("surgery_recommended"),
  furtherAssessmentNeeded: boolean("further_assessment_needed"),
  recommendations: text("recommendations"),
  clinicalNotes: text("clinical_notes"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const speechTherapySessions = pgTable("speech_therapy_sessions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  sessionDate: date("session_date").notNull(),
  therapistId: integer("therapist_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  sessionNumber: integer("session_number"),
  sessionDurationMinutes: integer("session_duration_minutes"),
  sessionType: varchar("session_type", { length: 50 }),
  goalsAddressed: text("goals_addressed"),
  activitiesPerformed: text("activities_performed"),
  progressNotes: text("progress_notes"),
  homeExercisesGiven: boolean("home_exercises_given"),
  homeExercisesDetails: text("home_exercises_details"),
  nextSessionDate: date("next_session_date"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const orthodonticAssessments = pgTable("orthodontic_assessments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  orthodontistId: integer("orthodontist_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  // Dental development
  dentitionStage: varchar("dentition_stage", { length: 50 }),
  maxillaryArchForm: varchar("maxillary_arch_form", { length: 50 }),
  mandibularArchForm: varchar("mandibular_arch_form", { length: 50 }),
  // Occlusion
  angleClassification: varchar("angle_classification", { length: 20 }),
  overjet: decimal("overjet", { precision: 4, scale: 1 }),
  overbite: decimal("overbite", { precision: 4, scale: 1 }),
  crossbite: boolean("crossbite"),
  crossbiteDetails: text("crossbite_details"),
  // Intervention
  interventionType: varchar("intervention_type", { length: 100 }),
  applianceType: varchar("appliance_type", { length: 100 }),
  appliancePlacedDate: date("appliance_placed_date"),
  applianceRemovedDate: date("appliance_removed_date"),
  // ABG planning
  abgTimingRecommendation: varchar("abg_timing_recommendation", { length: 50 }),
  abgReadiness: boolean("abg_readiness"),
  clinicalNotes: text("clinical_notes"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const entAssessments = pgTable("ent_assessments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  entSpecialistId: integer("ent_specialist_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  // Ear examination
  rightEarExam: text("right_ear_exam"),
  leftEarExam: text("left_ear_exam"),
  otitisMedia: boolean("otitis_media"),
  otitisMediaType: varchar("otitis_media_type", { length: 50 }),
  effusion: boolean("effusion"),
  // Hearing
  hearingAssessmentPerformed: boolean("hearing_assessment_performed"),
  hearingAssessmentType: varchar("hearing_assessment_type", { length: 50 }),
  rightEarHearing: varchar("right_ear_hearing", { length: 50 }),
  leftEarHearing: varchar("left_ear_hearing", { length: 50 }),
  hearingLossType: varchar("hearing_loss_type", { length: 50 }),
  hearingLossSeverity: varchar("hearing_loss_severity", { length: 50 }),
  // Intervention
  myringotomyPerformed: boolean("myringotomy_performed"),
  grommetsInserted: boolean("grommets_inserted"),
  grommetsDate: date("grommets_date"),
  hearingAidRecommended: boolean("hearing_aid_recommended"),
  hearingAidProvided: boolean("hearing_aid_provided"),
  clinicalNotes: text("clinical_notes"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const dentalAssessments = pgTable("dental_assessments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  dentistId: integer("dentist_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  // Dental status
  dentitionType: varchar("dentition_type", { length: 50 }),
  dmftScore: integer("dmft_score"),
  decayedTeeth: integer("decayed_teeth"),
  missingTeeth: integer("missing_teeth"),
  filledTeeth: integer("filled_teeth"),
  // For primary dentition (lowercase)
  dmftPrimaryScore: integer("dmft_primary_score"),
  // Oral hygiene
  oralHygieneStatus: varchar("oral_hygiene_status", { length: 50 }),
  gingivitis: boolean("gingivitis"),
  // Treatment
  treatmentProvided: text("treatment_provided"),
  fluorideApplied: boolean("fluoride_applied"),
  sealantsApplied: boolean("sealants_applied"),
  extractionsPerformed: integer("extractions_performed"),
  fillingsPlaced: integer("fillings_placed"),
  clinicalNotes: text("clinical_notes"),
  nextVisitDate: date("next_visit_date"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const psychosocialAssessments = pgTable("psychosocial_assessments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  assessorId: integer("assessor_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  // SDQ scores
  sdqEmotionalScore: integer("sdq_emotional_score"),
  sdqConductScore: integer("sdq_conduct_score"),
  sdqHyperactivityScore: integer("sdq_hyperactivity_score"),
  sdqPeerProblemsScore: integer("sdq_peer_problems_score"),
  sdqProsocialScore: integer("sdq_prosocial_score"),
  sdqTotalDifficulties: integer("sdq_total_difficulties"),
  sdqImpactScore: integer("sdq_impact_score"),
  // Quality of life
  qualityOfLifeScore: decimal("quality_of_life_score", { precision: 4, scale: 2 }),
  // Social aspects
  schoolAttendance: boolean("school_attendance"),
  schoolPerformance: varchar("school_performance", { length: 50 }),
  peerRelationships: varchar("peer_relationships", { length: 50 }),
  bullyingExperienced: boolean("bullying_experienced"),
  // Support
  counsellingRecommended: boolean("counselling_recommended"),
  counsellingProvided: boolean("counselling_provided"),
  familySupportAssessed: boolean("family_support_assessed"),
  familySupportAdequate: boolean("family_support_adequate"),
  referralMade: boolean("referral_made"),
  referralDetails: text("referral_details"),
  clinicalNotes: text("clinical_notes"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 7: OUTCOMES & QUALITY INDICATORS
// ============================================================================

export const outcomes = pgTable("outcomes", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  assessmentDate: date("assessment_date").notNull(),
  assessmentAge: varchar("assessment_age", { length: 20 }), // e.g., "5 years"
  assessorId: integer("assessor_id").references(() => users.id),
  facilityId: integer("facility_id").references(() => facilities.id),
  // Aesthetic outcome
  fiveYearOldIndexScore: decimal("five_year_old_index_score", { precision: 3, scale: 1 }),
  goslon: integer("goslon"),
  aestheticAssessment: varchar("aesthetic_assessment", { length: 50 }),
  lipSymmetry: varchar("lip_symmetry", { length: 50 }),
  noseSymmetry: varchar("nose_symmetry", { length: 50 }),
  scarQuality: varchar("scar_quality", { length: 50 }),
  // Speech outcome
  speechIntelligibilityScore: integer("speech_intelligibility_score"),
  velopharyngealFunction: varchar("velopharyngeal_function", { length: 50 }),
  speechOutcomeCategory: varchar("speech_outcome_category", { length: 50 }),
  // Dental outcome
  dentalHealth: varchar("dental_health", { length: 50 }),
  occlusionStatus: varchar("occlusion_status", { length: 50 }),
  // Fistula
  fistulaPresent: boolean("fistula_present").default(false),
  fistulaLocation: varchar("fistula_location", { length: 100 }),
  fistulaSize: varchar("fistula_size", { length: 50 }),
  // Re-operation
  reoperationRequired: boolean("reoperation_required").default(false),
  reoperationReason: text("reoperation_reason"),
  // Mortality
  mortality30Day: boolean("mortality_30_day").default(false),
  mortality90Day: boolean("mortality_90_day").default(false),
  // Overall
  overallOutcomeRating: varchar("overall_outcome_rating", { length: 50 }),
  clinicalNotes: text("clinical_notes"),
  // Photos
  outcomePhotoFrontal: text("outcome_photo_frontal"),
  outcomePhotoLateral: text("outcome_photo_lateral"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 8: FOLLOW-UP & OUTREACH
// ============================================================================

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  facilityId: integer("facility_id").references(() => facilities.id),
  scheduledDate: date("scheduled_date").notNull(),
  scheduledTime: varchar("scheduled_time", { length: 10 }),
  visitType: visitTypeEnum("visit_type").notNull(),
  appointmentType: varchar("appointment_type", { length: 100 }),
  department: varchar("department", { length: 100 }),
  providerUserId: integer("provider_user_id").references(() => users.id),
  status: appointmentStatusEnum("status").default("scheduled"),
  actualDate: date("actual_date"),
  missedDays: integer("missed_days"),
  cancellationReason: text("cancellation_reason"),
  rescheduledToId: integer("rescheduled_to_id"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const followUpAlerts = pgTable("follow_up_alerts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  alertType: varchar("alert_type", { length: 50 }).notNull(),
  alertDate: date("alert_date").notNull(),
  priority: varchar("priority", { length: 20 }),
  message: text("message"),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  isResolved: boolean("is_resolved").default(false),
  resolvedDate: date("resolved_date"),
  resolvedByUserId: integer("resolved_by_user_id").references(() => users.id),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const contactAttempts = pgTable("contact_attempts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  alertId: integer("alert_id").references(() => followUpAlerts.id),
  attemptDate: timestamp("attempt_date").notNull(),
  contactMethod: varchar("contact_method", { length: 50 }).notNull(),
  phoneNumberUsed: varchar("phone_number_used", { length: 20 }),
  contactedByUserId: integer("contacted_by_user_id").references(() => users.id),
  successful: boolean("successful").default(false),
  outcome: text("outcome"),
  nextActionPlanned: text("next_action_planned"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const outreachVisits = pgTable("outreach_visits", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  alertId: integer("alert_id").references(() => followUpAlerts.id),
  visitDate: date("visit_date").notNull(),
  visitedByUserId: integer("visited_by_user_id").references(() => users.id),
  visitLocation: text("visit_location"),
  gpsLatitude: decimal("gps_latitude", { precision: 10, scale: 7 }),
  gpsLongitude: decimal("gps_longitude", { precision: 10, scale: 7 }),
  patientFound: boolean("patient_found").default(false),
  visitOutcome: text("visit_outcome"),
  healthAssessmentDone: boolean("health_assessment_done").default(false),
  assessmentNotes: text("assessment_notes"),
  appointmentScheduled: boolean("appointment_scheduled").default(false),
  newAppointmentId: integer("new_appointment_id").references(() => appointments.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const patientTransfers = pgTable("patient_transfers", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id")
    .references(() => patients.id)
    .notNull(),
  fromFacilityId: integer("from_facility_id").references(() => facilities.id),
  toFacilityId: integer("to_facility_id").references(() => facilities.id),
  transferDate: date("transfer_date").notNull(),
  transferReason: text("transfer_reason"),
  referringUserId: integer("referring_user_id").references(() => users.id),
  acceptingUserId: integer("accepting_user_id").references(() => users.id),
  transferAccepted: boolean("transfer_accepted"),
  acceptedDate: date("accepted_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SECTION 9: RESEARCH & PUBLICATIONS
// ============================================================================

export const researchProjects = pgTable("research_projects", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  shortName: varchar("short_name", { length: 100 }),
  principalInvestigator: varchar("principal_investigator", { length: 255 }).notNull(),
  coInvestigators: text("co_investigators"),
  institution: varchar("institution", { length: 255 }),
  fundingSource: varchar("funding_source", { length: 255 }),
  fundingAmount: decimal("funding_amount", { precision: 12, scale: 2 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: researchStatusEnum("status").default("proposed"),
  // Ethics
  ethicsApprovalNumber: varchar("ethics_approval_number", { length: 100 }),
  ethicsApprovalDate: date("ethics_approval_date"),
  ethicsExpiryDate: date("ethics_expiry_date"),
  ethicsCommittee: varchar("ethics_committee", { length: 100 }),
  // Description
  objectives: text("objectives"),
  methodology: text("methodology"),
  dataRequirements: text("data_requirements"),
  expectedOutcomes: text("expected_outcomes"),
  // Approvals
  ncrApprovalStatus: varchar("ncr_approval_status", { length: 50 }),
  ncrApprovalDate: date("ncr_approval_date"),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  // Files
  protocolDocument: text("protocol_document"),
  ethicsApprovalDocument: text("ethics_approval_document"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const dataExtracts = pgTable("data_extracts", {
  id: serial("id").primaryKey(),
  researchProjectId: integer("research_project_id").references(() => researchProjects.id),
  requestedByUserId: integer("requested_by_user_id").references(() => users.id),
  requestDate: date("request_date").notNull(),
  purpose: text("purpose"),
  dataFieldsRequested: text("data_fields_requested"),
  inclusionCriteria: text("inclusion_criteria"),
  dateRangeStart: date("date_range_start"),
  dateRangeEnd: date("date_range_end"),
  recordsRequested: integer("records_requested"),
  // Approval
  approvalStatus: varchar("approval_status", { length: 50 }),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  approvalDate: date("approval_date"),
  approvalNotes: text("approval_notes"),
  // Extract
  extractDate: date("extract_date"),
  recordsExtracted: integer("records_extracted"),
  extractFormat: varchar("extract_format", { length: 50 }),
  extractFileHash: varchar("extract_file_hash", { length: 100 }),
  deIdentified: boolean("de_identified").default(true),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const publications = pgTable("publications", {
  id: serial("id").primaryKey(),
  researchProjectId: integer("research_project_id").references(() => researchProjects.id),
  title: varchar("title", { length: 500 }).notNull(),
  authors: text("authors").notNull(),
  journal: varchar("journal", { length: 255 }),
  publicationDate: date("publication_date"),
  doi: varchar("doi", { length: 100 }),
  pubmedId: varchar("pubmed_id", { length: 20 }),
  abstractText: text("abstract_text"),
  fullTextUrl: text("full_text_url"),
  publicationType: varchar("publication_type", { length: 50 }),
  usedNcrData: boolean("used_ncr_data").default(true),
  ncrAcknowledged: boolean("ncr_acknowledged"),
  impactFactor: decimal("impact_factor", { precision: 5, scale: 3 }),
  citations: integer("citations"),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// SYSTEM TABLES
// ============================================================================

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: text("setting_value"),
  description: text("description"),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

export const dataQualityReports = pgTable("data_quality_reports", {
  id: serial("id").primaryKey(),
  reportDate: date("report_date").notNull(),
  facilityId: integer("facility_id").references(() => facilities.id),
  totalPatients: integer("total_patients"),
  patientsWithDiagnosis: integer("patients_with_diagnosis"),
  patientsWithSurgery: integer("patients_with_surgery"),
  patientsWithFollowUp: integer("patients_with_follow_up"),
  completenessScore: decimal("completeness_score", { precision: 5, scale: 2 }),
  missingDemographics: integer("missing_demographics"),
  missingDiagnosis: integer("missing_diagnosis"),
  missingConsent: integer("missing_consent"),
  reportData: jsonb("report_data"),
  generatedByUserId: integer("generated_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`(strftime('%s', 'now'))`).notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const patientsRelations = relations(patients, ({ one, many }) => ({
  registeredBy: one(users, { fields: [patients.registeredByUserId], references: [users.id] }),
  registeredAtFacility: one(facilities, { fields: [patients.registeredAtFacilityId], references: [facilities.id] }),
  referredFromFacility: one(facilities, { fields: [patients.referredFromFacilityId], references: [facilities.id] }),
  currentFacility: one(facilities, { fields: [patients.currentFacilityId], references: [facilities.id] }),
  birthHistory: one(birthHistory),
  diagnoses: many(diagnoses),
  nutritionAssessments: many(nutritionAssessments),
  surgeries: many(surgeries),
  speechAssessments: many(speechAssessments),
  speechTherapySessions: many(speechTherapySessions),
  orthodonticAssessments: many(orthodonticAssessments),
  entAssessments: many(entAssessments),
  dentalAssessments: many(dentalAssessments),
  psychosocialAssessments: many(psychosocialAssessments),
  outcomes: many(outcomes),
  appointments: many(appointments),
  followUpAlerts: many(followUpAlerts),
  contactAttempts: many(contactAttempts),
  outreachVisits: many(outreachVisits),
  patientTransfers: many(patientTransfers),
}));

export const usersRelations = relations(users, ({ one }) => ({
  facility: one(facilities, { fields: [users.facilityId], references: [facilities.id] }),
}));

export const facilitiesRelations = relations(facilities, ({ one, many }) => ({
  parentFacility: one(facilities, { fields: [facilities.parentFacilityId], references: [facilities.id] }),
  users: many(users),
  patients: many(patients),
}));

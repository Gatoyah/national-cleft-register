import {
  sqliteTable,
  integer,
  text,
  real,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

function varchar(name: string) {
  return text(name);
}

function boolean(name: string) {
  return integer(name, { mode: "boolean" });
}

function timestamp(name: string) {
  return integer(name, { mode: "timestamp" });
}

function dateColumn(name: string) {
  return text(name);
}

function decimal(name: string) {
  return real(name);
}

function jsonb(name: string) {
  return text(name, { mode: "json" });
}

function serial(name: string) {
  return integer(name).primaryKey({ autoIncrement: true });
}

function pgEnum<TEnumName extends string>(name: TEnumName, values: readonly string[]) {
  return <TName extends string>(columnName: TName) => text(columnName);
}

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "clinician",
  "surgeon",
  "data_clerk",
  "viewer",
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
  "main_hub",
  "regional_hub",
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

export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "synced",
  "failed",
  "conflict",
]);

export const sexEnum = pgEnum("sex", ["male", "female", "intersex"]);

export const facilityConfig = sqliteTable("facility_config", {
  id: serial("id"),
  facilityId: text("facility_id").notNull().unique().default(sql`lower(hex(randomblob(16)))`),
  facilityName: varchar("facility_name").notNull(),
  facilityCode: varchar("facility_code").notNull().unique(),
  facilityType: facilityTypeEnum("facility_type").notNull().default("regional_hub"),
  region: regionEnum("region").notNull(),
  district: varchar("district"),
  mainHubUrl: varchar("main_hub_url"),
  apiKey: varchar("api_key"),
  apiKeyHash: varchar("api_key_hash"),
  lastSyncAt: timestamp("last_sync_at"),
  syncEnabled: boolean("sync_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = sqliteTable("users", {
  id: serial("id"),
  email: varchar("email").notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  role: userRoleEnum("role").notNull(),
  phone: varchar("phone"),
  professionalId: varchar("professional_id"),
  isActive: boolean("is_active").default(true),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: varchar("last_login_ip"),
  passwordChangedAt: timestamp("password_changed_at").defaultNow(),
  mustChangePassword: boolean("must_change_password").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: serial("id"),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionToken: varchar("session_token").notNull().unique(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: serial("id"),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action").notNull(),
  tableName: varchar("table_name").notNull(),
  recordId: integer("record_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const patients = sqliteTable("patients", {
  id: serial("id"),
  localId: text("local_id").notNull().unique().default(sql`lower(hex(randomblob(16)))`),
  ncrId: varchar("ncr_id").unique(),
  firstName: varchar("first_name").notNull(),
  middleName: varchar("middle_name"),
  lastName: varchar("last_name").notNull(),
  sex: sexEnum("sex").notNull(),
  dateOfBirth: dateColumn("date_of_birth").notNull(),
  placeOfBirth: varchar("place_of_birth"),
  regionOfResidence: regionEnum("region_of_residence").notNull(),
  districtOfResidence: varchar("district_of_residence"),
  townVillage: varchar("town_village"),
  gpsLatitude: decimal("gps_latitude"),
  gpsLongitude: decimal("gps_longitude"),
  caregiverName: varchar("caregiver_name").notNull(),
  caregiverRelationship: varchar("caregiver_relationship"),
  caregiverPhone: varchar("caregiver_phone"),
  caregiverPhone2: varchar("caregiver_phone_2"),
  isDeceased: boolean("is_deceased").default(false),
  deceasedDate: dateColumn("deceased_date"),
  syncStatus: syncStatusEnum("sync_status").default("pending"),
  syncedAt: timestamp("synced_at"),
  syncError: text("sync_error"),
  registeredByUserId: integer("registered_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const diagnoses = sqliteTable("diagnoses", {
  id: serial("id"),
  localId: text("local_id").notNull().unique().default(sql`lower(hex(randomblob(16)))`),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  diagnosisDate: dateColumn("diagnosis_date").notNull(),
  diagnosedAntenatally: boolean("diagnosed_antenatally").default(false),
  diagnosedAtBirth: boolean("diagnosed_at_birth").default(false),
  cleftType: cleftTypeEnum("cleft_type").notNull(),
  lipInvolved: boolean("lip_involved").default(false),
  lipLaterality: lateralityEnum("lip_laterality"),
  lipComplete: boolean("lip_complete"),
  alveolarInvolved: boolean("alveolar_involved").default(false),
  palateInvolved: boolean("palate_involved").default(false),
  palateType: palateTypeEnum("palate_type"),
  lahsalCode: varchar("lahsal_code"),
  hasAssociatedAnomalies: boolean("has_associated_anomalies").default(false),
  associatedAnomaliesDetails: text("associated_anomalies_details"),
  syncStatus: syncStatusEnum("sync_status").default("pending"),
  syncedAt: timestamp("synced_at"),
  diagnosedByUserId: integer("diagnosed_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const surgeries = sqliteTable("surgeries", {
  id: serial("id"),
  localId: text("local_id").notNull().unique().default(sql`lower(hex(randomblob(16)))`),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  surgeryDate: dateColumn("surgery_date").notNull(),
  surgeryType: surgeryTypeEnum("surgery_type").notNull(),
  isPrimarySurgery: boolean("is_primary_surgery").default(true),
  procedureDescription: text("procedure_description"),
  surgeonName: varchar("surgeon_name"),
  surgeonUserId: integer("surgeon_user_id").references(() => users.id),
  durationMinutes: integer("duration_minutes"),
  complications: boolean("complications").default(false),
  complicationsDetails: text("complications_details"),
  dischargeDate: dateColumn("discharge_date"),
  dischargeCondition: varchar("discharge_condition"),
  syncStatus: syncStatusEnum("sync_status").default("pending"),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const syncQueue = sqliteTable("sync_queue", {
  id: serial("id"),
  tableName: varchar("table_name").notNull(),
  recordLocalId: text("record_local_id").notNull(),
  operation: varchar("operation").notNull(),
  payload: jsonb("payload").notNull(),
  priority: integer("priority").default(0),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(5),
  lastAttemptAt: timestamp("last_attempt_at"),
  lastError: text("last_error"),
  status: syncStatusEnum("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  id: serial("id"),
  identifier: varchar("identifier").notNull(),
  endpoint: varchar("endpoint").notNull(),
  requestCount: integer("request_count").default(1),
  windowStart: timestamp("window_start").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blockedIps = sqliteTable("blocked_ips", {
  id: serial("id"),
  ipAddress: varchar("ip_address").notNull().unique(),
  reason: text("reason"),
  blockedUntil: timestamp("blocked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const patientsRelations = relations(patients, ({ one, many }) => ({
  registeredBy: one(users, { fields: [patients.registeredByUserId], references: [users.id] }),
  diagnoses: many(diagnoses),
  surgeries: many(surgeries),
}));

export const diagnosesRelations = relations(diagnoses, ({ one }) => ({
  patient: one(patients, { fields: [diagnoses.patientId], references: [patients.id] }),
  diagnosedBy: one(users, { fields: [diagnoses.diagnosedByUserId], references: [users.id] }),
}));

export const surgeriesRelations = relations(surgeries, ({ one }) => ({
  patient: one(patients, { fields: [surgeries.patientId], references: [patients.id] }),
  surgeon: one(users, { fields: [surgeries.surgeonUserId], references: [users.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  auditLogs: many(auditLogs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

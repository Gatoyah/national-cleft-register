/**
 * Role-based access control for the Main Hub.
 *
 * Every API route and every page checks one of these permissions. Change the
 * matrix here and the whole app (API, pages, sidebar) follows.
 */

export const ROLES = [
  "admin",
  "clinician",
  "surgeon",
  "data_clerk",
  "researcher",
  "viewer",
  "community_health_worker",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "patients.view", //        see identifiable patient records
  "patients.create", //      register new patients
  "patients.edit", //        edit demographics / status
  "clinical.edit", //        add diagnoses
  "surgeries.view",
  "surgeries.create",
  "appointments.view",
  "appointments.create",
  "alerts.view",
  "stats.view", //           aggregate statistics only (no identities)
  "reports.view", //         aggregate reports
  "research.view", //        research projects page
  "export.deidentified", //  de-identified research dataset (consented patients only)
  "export.full", //          full identifiable export
  "users.manage", //         create / edit / disable accounts
  "hubs.manage", //          register regional hubs, rotate sync keys
  "facilities.view",
  "sync.view",
  "audit.view",
  "settings.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Full access to everything, including creating accounts for other people.
  admin: ALL,
  clinician: [
    "patients.view", "patients.create", "patients.edit", "clinical.edit",
    "surgeries.view", "appointments.view", "appointments.create", "alerts.view",
    "stats.view", "reports.view", "facilities.view",
  ],
  surgeon: [
    "patients.view", "patients.create", "patients.edit", "clinical.edit",
    "surgeries.view", "surgeries.create", "appointments.view", "appointments.create",
    "alerts.view", "stats.view", "reports.view", "facilities.view",
  ],
  data_clerk: [
    "patients.view", "patients.create", "patients.edit",
    "surgeries.view", "appointments.view", "appointments.create",
    "stats.view", "facilities.view",
  ],
  // Researchers never see identities: aggregates + de-identified, consented data only.
  researcher: ["stats.view", "reports.view", "research.view", "export.deidentified"],
  viewer: ["stats.view", "reports.view"],
  community_health_worker: ["patients.view", "appointments.view", "alerts.view"],
};

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as Role];
  return !!perms && perms.includes(permission);
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access to everything, manages user accounts, hubs and settings",
  clinician: "Register and edit patients, add diagnoses and appointments",
  surgeon: "Everything a clinician can do, plus record surgeries",
  data_clerk: "Register and edit patients and appointments",
  researcher: "Statistics, reports and de-identified research exports only (no names)",
  viewer: "Read-only statistics and reports (no names)",
  community_health_worker: "View patients, appointments and follow-up alerts",
};

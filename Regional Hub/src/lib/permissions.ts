/**
 * Role-based access control for a Regional Hub. Every API route, page and the
 * sidebar check these permissions.
 */

export const ROLES = ["admin", "clinician", "surgeon", "data_clerk", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "patients.view", //    identifiable patient records
  "patients.create",
  "patients.edit",
  "surgeries.view",
  "surgeries.create",
  "stats.view", //       aggregate statistics only (no identities)
  "sync.manage", //      configure and run sync with the Main Hub
  "users.manage", //     create / edit / disable accounts
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  clinician: ["patients.view", "patients.create", "patients.edit", "surgeries.view", "stats.view"],
  surgeon: ["patients.view", "patients.create", "patients.edit", "surgeries.view", "surgeries.create", "stats.view"],
  data_clerk: ["patients.view", "patients.create", "surgeries.view", "stats.view"],
  viewer: ["stats.view"],
};

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return !!ROLE_PERMISSIONS[role as Role]?.includes(permission);
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access: users, sync with the Main Hub, audit log and all patient data",
  clinician: "Register, view and edit patients",
  surgeon: "Everything a clinician can do, plus record surgeries",
  data_clerk: "Register and view patients",
  viewer: "Statistics only (no patient names)",
};

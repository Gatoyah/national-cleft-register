import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function generateNCRId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `NCR-${year}-${random}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function calculateAge(birthDate: Date | string | null | undefined): string {
  if (!birthDate) return "N/A";
  const birth = new Date(birthDate);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  
  if (months < 0) {
    years--;
    months += 12;
  }
  
  if (today.getDate() < birth.getDate()) {
    months--;
    if (months < 0) {
      years--;
      months += 12;
    }
  }

  if (years === 0) {
    return `${months} month${months !== 1 ? "s" : ""}`;
  }
  
  return `${years} year${years !== 1 ? "s" : ""}`;
}

export function getRegionLabel(region: string): string {
  const labels: Record<string, string> = {
    ashanti: "Ashanti",
    greater_accra: "Greater Accra",
    northern: "Northern",
    western: "Western",
    eastern: "Eastern",
    central: "Central",
    volta: "Volta",
    upper_east: "Upper East",
    upper_west: "Upper West",
    bono: "Bono",
    bono_east: "Bono East",
    ahafo: "Ahafo",
    western_north: "Western North",
    oti: "Oti",
    north_east: "North East",
    savannah: "Savannah",
  };
  return labels[region] || region;
}

export function getCleftTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cleft_lip_only: "Cleft Lip Only",
    cleft_palate_only: "Cleft Palate Only",
    cleft_lip_and_palate: "Cleft Lip and Palate",
  };
  return labels[type] || type;
}

export function getLateralityLabel(laterality: string): string {
  const labels: Record<string, string> = {
    unilateral_left: "Unilateral Left",
    unilateral_right: "Unilateral Right",
    bilateral: "Bilateral",
    midline: "Midline",
  };
  return labels[laterality] || laterality;
}

export function getSurgeryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    primary_lip_repair: "Primary Lip Repair",
    primary_palate_repair: "Primary Palate Repair",
    secondary_lip_revision: "Secondary Lip Revision",
    alveolar_bone_graft: "Alveolar Bone Graft",
    pharyngoplasty: "Pharyngoplasty",
    fistula_repair: "Fistula Repair",
    rhinoplasty: "Rhinoplasty",
    other: "Other",
  };
  return labels[type] || type;
}

export function getUserRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Administrator",
    clinician: "Clinician",
    surgeon: "Surgeon",
    data_clerk: "Data Clerk",
    researcher: "Researcher",
    viewer: "Viewer",
    community_health_worker: "Community Health Worker",
  };
  return labels[role] || role;
}

export function getFacilityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    hub: "Hub",
    co_hub: "Co-Hub",
    regional_centre: "Regional Centre",
    district_hospital: "District Hospital",
    chps_compound: "CHPS Compound",
    ngo: "NGO",
    mission_hospital: "Mission Hospital",
  };
  return labels[type] || type;
}

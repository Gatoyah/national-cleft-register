import { requirePagePermission } from "@/lib/auth";

export default async function GuardLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission("appointments.create");
  return children;
}

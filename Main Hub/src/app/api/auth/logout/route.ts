import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const user = await getCurrentUser();

  await destroySession();

  if (user) {
    await logAudit({
      userId: user.id,
      action: "logout",
      tableName: "users",
      recordId: user.id,
    });
  }

  return NextResponse.json({ success: true });
}

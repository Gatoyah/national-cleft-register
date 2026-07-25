import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { logAudit, addSecurityHeaders } from "@/lib/security";

export async function POST() {
  const session = await getSession();
  
  if (session) {
    await logAudit(session.userId, "logout", "sessions", null, null, null);
  }
  
  await destroySession();
  
  return addSecurityHeaders(
    NextResponse.json({ success: true })
  );
}

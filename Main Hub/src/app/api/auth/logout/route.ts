import { NextRequest, NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  await destroySession();
  if (user) {
    await logAudit({ userId: user.id, action: "logout", tableName: "users", recordId: user.id });
  }
  // Plain HTML form submission (sidebar "Sign out") -> send the browser to /login.
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Relative Location: request.url says "localhost" even when the user opened
    // the hub as http://192.168.x.x, and a cross-origin redirect would be blocked
    // by the page's Content-Security-Policy (form-action 'self').
    return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  }
  return NextResponse.json({ success: true });
}

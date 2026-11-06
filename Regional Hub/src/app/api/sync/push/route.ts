import { NextRequest, NextResponse } from "next/server";
import { requireMutation } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api";
import { runSync } from "@/lib/sync";

/** "Sync now": push everything pending, then pull updates from the Main Hub. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "sync.manage");
    if (user instanceof NextResponse) return user;
    const limit = rateLimit(`sync-now:${user.id}`, 30, 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Please wait a moment before syncing again." }, { status: 429 });

    const result = await runSync("manual", user.id);
    return NextResponse.json({ ...result, timestamp: new Date().toISOString() }, { status: result.ok || result.skipped ? 200 : 502 });
  } catch (error) {
    return apiError(error, "Sync failed");
  }
}

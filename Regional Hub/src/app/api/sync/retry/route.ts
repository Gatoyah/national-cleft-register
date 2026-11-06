import { NextRequest, NextResponse } from "next/server";
import { requireMutation } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api";
import { retryFailed, syncSoon } from "@/lib/sync";

/** Put records the Main Hub rejected back in the queue (e.g. after fixing the data). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireMutation(request, "sync.manage");
    if (user instanceof NextResponse) return user;
    const n = await retryFailed();
    await logAudit({ userId: user.id, action: "sync_retry_failed", tableName: "sync_queue", newValues: { requeued: n } });
    syncSoon();
    return NextResponse.json({ requeued: n });
  } catch (error) {
    return apiError(error, "Retry failed");
  }
}

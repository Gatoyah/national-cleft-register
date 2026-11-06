import { db, auditLogs } from "@/db";
import { headers } from "next/headers";

/**
 * Log an auditable action to the audit_logs table.
 * Captures IP address and user agent from the request headers.
 */
export async function logAudit(params: {
  userId: number | null;
  action: string;
  tableName: string;
  recordId?: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const headerStore = await headers();
    const ipAddress =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip") ||
      "unknown";
    const userAgent = headerStore.get("user-agent") || "unknown";

    await db.insert(auditLogs).values({
      userId: params.userId,
      action: params.action,
      tableName: params.tableName,
      recordId: params.recordId ?? null,
      oldValues: params.oldValues ?? null,
      newValues: params.newValues ?? null,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    // Audit logging should never crash the main request
    console.error("Failed to write audit log:", error);
  }
}

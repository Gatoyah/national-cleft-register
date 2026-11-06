import Link from "next/link";
import { db, auditLogs, users } from "@/db";
import { desc, eq, like, and, type SQL } from "drizzle-orm";
import { requirePagePermission } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

/** Admin-only: who did what, when, from where. Includes every patient view, export and sync. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requirePagePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const action = (sp.action || "").slice(0, 50);

  const filters: SQL[] = [];
  if (action) filters.push(like(auditLogs.action, `%${action}%`));

  const rows = await db
    .select({
      id: auditLogs.id, action: auditLogs.action, tableName: auditLogs.tableName, recordId: auditLogs.recordId,
      newValues: auditLogs.newValues, ipAddress: auditLogs.ipAddress, createdAt: auditLogs.createdAt,
      email: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-500 mt-1">Every sign-in, record change, patient view, export and sync is recorded here.</p>
      </div>
      <form className="flex gap-2" method="GET">
        <input name="action" defaultValue={action} placeholder="Filter by action (e.g. login_failed, export, sync)" className="w-96 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">Filter</button>
      </form>
      <Card noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{r.createdAt.toLocaleString("en-GB")}</TableCell>
                <TableCell className="text-xs">{r.email ?? "system / sync"}</TableCell>
                <TableCell className="font-mono text-xs">{r.action}</TableCell>
                <TableCell className="text-xs">{r.tableName}{r.recordId ? ` #${r.recordId}` : ""}</TableCell>
                <TableCell className="text-xs max-w-md truncate" title={r.newValues ? JSON.stringify(r.newValues) : ""}>
                  {r.newValues ? JSON.stringify(r.newValues) : ""}
                </TableCell>
                <TableCell className="text-xs">{r.ipAddress}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="flex gap-4 text-sm">
        {page > 1 && <Link className="text-emerald-700 hover:underline" href={`/audit?page=${page - 1}&action=${encodeURIComponent(action)}`}>← Newer</Link>}
        {rows.length === PAGE_SIZE && <Link className="text-emerald-700 hover:underline" href={`/audit?page=${page + 1}&action=${encodeURIComponent(action)}`}>Older →</Link>}
      </div>
    </div>
  );
}

import { db, facilities, patients, surgeries, auditLogs } from "@/db";
import { eq, count, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getSyncStats() {
  const [
    totalPatientsResult,
    totalSurgeriesResult,
    recentActivity,
  ] = await Promise.all([
    db.select({ count: count() }).from(patients),
    db.select({ count: count() }).from(surgeries),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(20),
  ]);

  return {
    totalPatients: totalPatientsResult[0]?.count || 0,
    totalSurgeries: totalSurgeriesResult[0]?.count || 0,
    recentActivity,
  };
}

export default async function SyncPage() {
  const stats = await getSyncStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Synchronization</h1>
          <p className="text-gray-500 mt-1">Manage offline data and sync with regional hubs</p>
        </div>
        <Button>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync Now
        </Button>
      </div>

      {/* Sync Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <div>
                <p className="text-sm text-gray-500">Connection Status</p>
                <p className="text-lg font-bold">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total Records</p>
            <p className="text-2xl font-bold">{(stats.totalPatients + stats.totalSurgeries).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Pending Upload</p>
            <p className="text-2xl font-bold text-amber-600">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Last Full Sync</p>
            <p className="text-lg font-bold">{formatDate(new Date())}</p>
          </CardContent>
        </Card>
      </div>

      {/* Offline Mode Explanation */}
      <Card>
        <CardHeader>
          <CardTitle>Offline-First Data Entry</CardTitle>
          <CardDescription>How the system handles data when internet is unavailable</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-medium mb-2">1. Enter Data Offline</h3>
              <p className="text-sm text-gray-600">
                Data entry works without internet. Records are stored locally in the browser database.
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 className="font-medium mb-2">2. Automatic Queue</h3>
              <p className="text-sm text-gray-600">
                When offline, changes are queued. The sync indicator shows pending items.
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-medium mb-2">3. Auto-Sync Online</h3>
              <p className="text-sm text-gray-600">
                When connection is restored, queued data automatically syncs to the server.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regional Hub Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle>Regional Hub Sync Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facility</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Records Sent</TableHead>
                <TableHead>Records Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Korle Bu Teaching Hospital</TableCell>
                <TableCell>{formatDate(new Date())}</TableCell>
                <TableCell>0</TableCell>
                <TableCell>0</TableCell>
                <TableCell><Badge variant="success">Synced</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Tamale Teaching Hospital</TableCell>
                <TableCell>{formatDate(new Date())}</TableCell>
                <TableCell>0</TableCell>
                <TableCell>0</TableCell>
                <TableCell><Badge variant="success">Synced</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentActivity.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {stats.recentActivity.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="font-medium capitalize">{log.action}</span>
                    <span className="text-gray-500"> on </span>
                    <span className="font-mono text-sm">{log.tableName}</span>
                    {log.recordId && (
                      <span className="text-gray-400 text-sm"> (ID: {log.recordId})</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-400">{formatDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technical Implementation Note */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Notes for Sub-Hub Development</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-600">
              Regional hub applications should implement the following for offline-first capability:
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li><strong>IndexedDB</strong> - Store patient and surgery records locally</li>
              <li><strong>Service Worker</strong> - Enable offline form submission</li>
              <li><strong>Sync Queue</strong> - Track pending uploads in localStorage</li>
              <li><strong>Conflict Resolution</strong> - Use timestamps to resolve sync conflicts</li>
              <li><strong>API Authentication</strong> - Use facility API keys for sync endpoints</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

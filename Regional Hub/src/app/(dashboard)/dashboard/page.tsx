import { requirePageUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { db, patients, surgeries, diagnoses, syncQueue, facilityConfig } from "@/db";
import { eq, count, desc, gte, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getRegionLabel, getCleftTypeLabel, calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);

  const [
    config,
    totalPatientsResult,
    patientsThisYearResult,
    totalSurgeriesResult,
    surgeriesThisYearResult,
    pendingSyncResult,
    cleftTypeResult,
  ] = await Promise.all([
    db.select().from(facilityConfig).limit(1),
    db.select({ count: count() }).from(patients),
    db.select({ count: count() }).from(patients).where(gte(patients.createdAt, startOfYear)),
    db.select({ count: count() }).from(surgeries),
    db.select({ count: count() }).from(surgeries).where(gte(surgeries.createdAt, startOfYear)),
    db.select({ count: count() }).from(syncQueue).where(eq(syncQueue.status, "pending")),
    db.select({
      cleftType: diagnoses.cleftType,
      count: count(),
    }).from(diagnoses).groupBy(diagnoses.cleftType),
  ]);

  return {
    facility: config[0],
    totalPatients: totalPatientsResult[0]?.count || 0,
    patientsThisYear: patientsThisYearResult[0]?.count || 0,
    totalSurgeries: totalSurgeriesResult[0]?.count || 0,
    surgeriesThisYear: surgeriesThisYearResult[0]?.count || 0,
    pendingSync: pendingSyncResult[0]?.count || 0,
    cleftTypes: cleftTypeResult,
    currentYear,
  };
}

async function getRecentPatients() {
  return db
    .select({
      id: patients.id,
      localId: patients.localId,
      ncrId: patients.ncrId,
      firstName: patients.firstName,
      lastName: patients.lastName,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      regionOfResidence: patients.regionOfResidence,
      syncStatus: patients.syncStatus,
      createdAt: patients.createdAt,
    })
    .from(patients)
    .orderBy(desc(patients.createdAt))
    .limit(10);
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  // Roles without patient access (viewer) only see aggregate numbers.
  const showPatients = hasPermission(user.role, "patients.view");
  const [stats, recentPatients] = await Promise.all([
    getStats(),
    showPatients ? getRecentPatients() : Promise.resolve([]),
  ]);

  const totalCleftCases = stats.cleftTypes.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {stats.facility?.facilityName || "Regional Hub"} Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            {stats.facility?.region ? getRegionLabel(stats.facility.region) : ""} Region - Cleft Birth Registry
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-gray-500">Facility Code: <span className="font-mono font-bold">{stats.facility?.facilityCode || "N/A"}</span></p>
          <div className="flex items-center gap-2 mt-1">
            {stats.pendingSync > 0 ? (
              <Badge variant="warning">{stats.pendingSync} pending sync</Badge>
            ) : (
              <Badge variant="success">Synced</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Total Cleft Births</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalPatients}</p>
            <p className="text-sm text-blue-600 mt-2">+{stats.patientsThisYear} in {stats.currentYear}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Total Surgeries</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalSurgeries}</p>
            <p className="text-sm text-emerald-600 mt-2">+{stats.surgeriesThisYear} in {stats.currentYear}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Awaiting Surgery</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {stats.totalPatients - stats.totalSurgeries}
            </p>
            <p className="text-sm text-gray-500 mt-2">Registered without surgery</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Pending Sync</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.pendingSync}</p>
            <p className="text-sm text-gray-500 mt-2">
              {stats.facility?.lastSyncAt ? `Last: ${formatDate(stats.facility.lastSyncAt)}` : "Never synced"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/patients/new" className="block">
          <Card className="hover:border-emerald-500 transition-colors cursor-pointer">
            <CardContent className="text-center py-6">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="font-medium">Register Birth</p>
              <p className="text-sm text-gray-500">New cleft patient</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/surgeries/new" className="block">
          <Card className="hover:border-blue-500 transition-colors cursor-pointer">
            <CardContent className="text-center py-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <p className="font-medium">Record Surgery</p>
              <p className="text-sm text-gray-500">Document procedure</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/sync" className="block">
          <Card className="hover:border-amber-500 transition-colors cursor-pointer">
            <CardContent className="text-center py-6">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <p className="font-medium">Sync Data</p>
              <p className="text-sm text-gray-500">Upload to main hub</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/statistics" className="block">
          <Card className="hover:border-purple-500 transition-colors cursor-pointer">
            <CardContent className="text-center py-6">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="font-medium">Statistics</p>
              <p className="text-sm text-gray-500">View reports</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Registrations */}
        {showPatients && (
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Registrations</CardTitle>
                <Link href="/patients" className="text-sm text-emerald-600 hover:underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Sex</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                        No patients registered yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentPatients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell>
                          <Link href={`/patients/${patient.id}`} className="font-medium text-emerald-600 hover:underline">
                            {patient.firstName} {patient.lastName}
                          </Link>
                          <p className="text-xs text-gray-400">{patient.ncrId || patient.localId.slice(0, 8)}</p>
                        </TableCell>
                        <TableCell className="capitalize">{patient.sex}</TableCell>
                        <TableCell>{calculateAge(patient.dateOfBirth)}</TableCell>
                        <TableCell>{getRegionLabel(patient.regionOfResidence)}</TableCell>
                        <TableCell>
                          <Badge variant={patient.syncStatus === "synced" ? "success" : patient.syncStatus === "failed" ? "danger" : "warning"}>
                            {patient.syncStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Cleft Type Distribution */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Cleft Types</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.cleftTypes.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No diagnosis data</p>
              ) : (
                <div className="space-y-4">
                  {stats.cleftTypes.map((item) => {
                    const percentage = totalCleftCases > 0 ? Math.round((item.count / totalCleftCases) * 100) : 0;
                    return (
                      <div key={item.cleftType}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{getCleftTypeLabel(item.cleftType)}</span>
                          <span className="font-medium">{item.count} ({percentage}%)</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

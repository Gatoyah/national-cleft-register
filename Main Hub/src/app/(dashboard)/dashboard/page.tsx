import { requirePageUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { db, patients, surgeries, diagnoses, facilities } from "@/db";
import { eq, count, sql, gte, and, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getRegionLabel, getCleftTypeLabel, calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1).toISOString().split("T")[0];
  const lastYear = new Date(currentYear - 1, 0, 1).toISOString().split("T")[0];
  const endOfLastYear = new Date(currentYear - 1, 11, 31).toISOString().split("T")[0];

  const [
    totalPatientsResult,
    birthsThisYearResult,
    birthsLastYearResult,
    totalSurgeriesResult,
    surgeriesThisYearResult,
    surgeriesLastYearResult,
    awaitingSurgeryResult,
    regionalHubsResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(patients),
    db.select({ count: count() }).from(patients).where(gte(patients.createdAt, new Date(startOfYear))),
    db.select({ count: count() }).from(patients).where(
      and(
        gte(patients.createdAt, new Date(lastYear)),
        sql`${patients.createdAt} <= ${endOfLastYear}`
      )
    ),
    db.select({ count: count() }).from(surgeries),
    db.select({ count: count() }).from(surgeries).where(gte(surgeries.surgeryDate, startOfYear)),
    db.select({ count: count() }).from(surgeries).where(
      and(
        gte(surgeries.surgeryDate, lastYear),
        sql`${surgeries.surgeryDate} <= ${endOfLastYear}`
      )
    ),
    // Patients without surgery
    db.select({ count: count() })
      .from(patients)
      .where(
        and(
          eq(patients.isDeceased, false),
          sql`not exists (select 1 from surgeries where surgeries.patient_id = ${patients.id})`
        )
      ),
    db.select({ count: count() }).from(facilities).where(eq(facilities.isActive, true)),
  ]);

  const awaitingCount = awaitingSurgeryResult[0]?.count || 0;

  return {
    totalPatients: totalPatientsResult[0]?.count || 0,
    birthsThisYear: birthsThisYearResult[0]?.count || 0,
    birthsLastYear: birthsLastYearResult[0]?.count || 0,
    totalSurgeries: totalSurgeriesResult[0]?.count || 0,
    surgeriesThisYear: surgeriesThisYearResult[0]?.count || 0,
    surgeriesLastYear: surgeriesLastYearResult[0]?.count || 0,
    awaitingSurgery: awaitingCount,
    activeHubs: regionalHubsResult[0]?.count || 0,
    currentYear,
  };
}

async function getRecentRegistrations() {
  return db
    .select({
      id: patients.id,
      ncrId: patients.ncrId,
      firstName: patients.firstName,
      lastName: patients.lastName,
      sex: patients.sex,
      dateOfBirth: patients.dateOfBirth,
      regionOfResidence: patients.regionOfResidence,
      createdAt: patients.createdAt,
    })
    .from(patients)
    .orderBy(desc(patients.createdAt))
    .limit(10);
}

async function getCleftTypeDistribution() {
  return db
    .select({
      cleftType: diagnoses.cleftType,
      count: count(),
    })
    .from(diagnoses)
    .where(eq(diagnoses.isPrimaryDiagnosis, true))
    .groupBy(diagnoses.cleftType);
}

async function getRegionalDistribution() {
  return db
    .select({
      region: patients.regionOfResidence,
      count: count(),
    })
    .from(patients)
    .groupBy(patients.regionOfResidence)
    .orderBy(desc(count()));
}

async function getMonthlyTrends() {
  // In SQLite, p.created_at is stored as millisecond timestamp, and surgery_date is a string 'YYYY-MM-DD'
  const result = await db.all(sql`
    SELECT 
      strftime('%Y-%m', datetime(p.created_at / 1000, 'unixepoch')) as month,
      COUNT(*) as births,
      (SELECT COUNT(*) FROM surgeries WHERE substr(surgeries.surgery_date, 1, 7) = strftime('%Y-%m', datetime(p.created_at / 1000, 'unixepoch'))) as surgeries
    FROM patients p
    WHERE datetime(p.created_at / 1000, 'unixepoch') >= datetime('now', '-12 months')
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `);
  return result as unknown as { month: string; births: string; surgeries: string }[];
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  // Roles without patient access (researcher, viewer) only see aggregate numbers.
  const showPatients = hasPermission(user.role, "patients.view");
  const [stats, recentPatients, cleftTypes, regions, trends] = await Promise.all([
    getStats(),
    showPatients ? getRecentRegistrations() : Promise.resolve([]),
    getCleftTypeDistribution(),
    getRegionalDistribution(),
    getMonthlyTrends(),
  ]);

  const totalCleftCases = cleftTypes.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registry Dashboard</h1>
          <p className="text-gray-500 mt-1">National Cleft Birth and Surgery Tracking - Ghana</p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <p>Data as of: {formatDate(new Date())}</p>
          <p className="font-medium text-gray-700">Smile Train Partner Registry</p>
        </div>
      </div>

      {/* Key Metrics for Smile Train */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Cleft Births Registered</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalPatients.toLocaleString()}</p>
            <div className="mt-2 text-sm">
              <span className="text-blue-600 font-medium">{stats.birthsThisYear}</span>
              <span className="text-gray-500"> in {stats.currentYear}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Surgeries Completed</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalSurgeries.toLocaleString()}</p>
            <div className="mt-2 text-sm">
              <span className="text-emerald-600 font-medium">{stats.surgeriesThisYear}</span>
              <span className="text-gray-500"> in {stats.currentYear}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Awaiting Surgery</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.awaitingSurgery.toLocaleString()}</p>
            <div className="mt-2 text-sm text-gray-500">
              Patients without surgical record
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent>
            <p className="text-sm font-medium text-gray-500">Active Regional Hubs</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{stats.activeHubs}</p>
            <div className="mt-2 text-sm text-gray-500">
              Across 16 regions
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Year-over-Year Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Year-over-Year Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Births {stats.currentYear - 1}</p>
              <p className="text-2xl font-bold">{stats.birthsLastYear}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Births {stats.currentYear}</p>
              <p className="text-2xl font-bold text-blue-600">{stats.birthsThisYear}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Surgeries {stats.currentYear - 1}</p>
              <p className="text-2xl font-bold">{stats.surgeriesLastYear}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Surgeries {stats.currentYear}</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.surgeriesThisYear}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cleft Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Cleft Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {cleftTypes.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No diagnosis data available</p>
            ) : (
              <div className="space-y-4">
                {cleftTypes.map((item) => {
                  const percentage = totalCleftCases > 0 
                    ? Math.round((item.count / totalCleftCases) * 100) 
                    : 0;
                  return (
                    <div key={item.cleftType}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">
                          {getCleftTypeLabel(item.cleftType)}
                        </span>
                        <span className="text-sm font-bold">
                          {item.count} ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
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

        {/* Regional Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Regional Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {regions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No regional data available</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {regions.map((item, idx) => (
                  <div key={item.region} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-4">{idx + 1}.</span>
                      <span className="text-sm text-gray-700">{getRegionLabel(item.region)}</span>
                    </div>
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Registrations */}
      {showPatients && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Cleft Birth Registrations</CardTitle>
            <Link href="/patients" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              View all
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCR ID</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Sex</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPatients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    No patients registered yet.{" "}
                    <Link href="/patients/new" className="text-emerald-600 hover:underline">
                      Register the first patient
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                recentPatients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <Link href={`/patients/${patient.id}`} className="text-emerald-600 hover:underline font-mono text-sm">
                        {patient.ncrId}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {patient.firstName} {patient.lastName}
                    </TableCell>
                    <TableCell className="capitalize">{patient.sex}</TableCell>
                    <TableCell>{calculateAge(patient.dateOfBirth)}</TableCell>
                    <TableCell>{getRegionLabel(patient.regionOfResidence)}</TableCell>
                    <TableCell>{formatDate(patient.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="warning">Awaiting Surgery</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {/* Monthly Trends */}
      {trends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trends (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Month</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Births</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Surgeries</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.map((row) => (
                    <tr key={row.month} className="border-b last:border-0">
                      <td className="py-2 px-3">{row.month}</td>
                      <td className="py-2 px-3 text-right font-medium text-blue-600">{row.births}</td>
                      <td className="py-2 px-3 text-right font-medium text-emerald-600">{row.surgeries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { db, patients, surgeries, diagnoses, appointments, followUpAlerts } from "@/db";
import { count, eq, sql, gte, and, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { getRegionLabel, getCleftTypeLabel, getSurgeryTypeLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getReportData() {
  const currentYear = new Date().getFullYear();
  const startOfYear = new Date(currentYear, 0, 1).toISOString().split("T")[0];

  const [
    totalPatientsResult,
    totalSurgeriesResult,
    surgeriesThisYearResult,
    pendingFollowUpsResult,
    regionalDistribution,
    cleftTypeDistribution,
    surgeryTypeDistribution,
    monthlyRegistrations,
  ] = await Promise.all([
    db.select({ count: count() }).from(patients),
    db.select({ count: count() }).from(surgeries),
    db.select({ count: count() }).from(surgeries).where(gte(surgeries.surgeryDate, startOfYear)),
    db.select({ count: count() }).from(followUpAlerts).where(eq(followUpAlerts.isResolved, false)),
    db.select({
      region: patients.regionOfResidence,
      count: count(),
    }).from(patients).groupBy(patients.regionOfResidence).orderBy(desc(count())),
    db.select({
      cleftType: diagnoses.cleftType,
      count: count(),
    }).from(diagnoses).where(eq(diagnoses.isPrimaryDiagnosis, true)).groupBy(diagnoses.cleftType),
    db.select({
      surgeryType: surgeries.surgeryType,
      count: count(),
    }).from(surgeries).groupBy(surgeries.surgeryType).orderBy(desc(count())),
    db.select({
      month: sql<string>`to_char(${patients.createdAt}, 'YYYY-MM')`,
      count: count(),
    }).from(patients).groupBy(sql`to_char(${patients.createdAt}, 'YYYY-MM')`).orderBy(desc(sql`to_char(${patients.createdAt}, 'YYYY-MM')`)).limit(12),
  ]);

  return {
    totalPatients: totalPatientsResult[0]?.count || 0,
    totalSurgeries: totalSurgeriesResult[0]?.count || 0,
    surgeriesThisYear: surgeriesThisYearResult[0]?.count || 0,
    pendingFollowUps: pendingFollowUpsResult[0]?.count || 0,
    regionalDistribution,
    cleftTypeDistribution,
    surgeryTypeDistribution,
    monthlyRegistrations: monthlyRegistrations.reverse(),
  };
}

export default async function ReportsPage() {
  const data = await getReportData();

  const totalCleftCases = data.cleftTypeDistribution.reduce((sum, d) => sum + d.count, 0);
  const totalSurgeryTypes = data.surgeryTypeDistribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Registry statistics and outcome monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Data
          </Button>
          <Button>Generate Annual Report</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Total Patients</p>
            <p className="text-3xl font-bold text-gray-900">{data.totalPatients.toLocaleString()}</p>
            <p className="text-sm text-emerald-600 mt-1">All-time registrations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Total Surgeries</p>
            <p className="text-3xl font-bold text-gray-900">{data.totalSurgeries.toLocaleString()}</p>
            <p className="text-sm text-emerald-600 mt-1">{data.surgeriesThisYear} this year</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Surgery Rate</p>
            <p className="text-3xl font-bold text-gray-900">
              {data.totalPatients > 0 
                ? Math.round((data.totalSurgeries / data.totalPatients) * 100) 
                : 0}%
            </p>
            <p className="text-sm text-gray-500 mt-1">Patients with surgery</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Pending Follow-ups</p>
            <p className="text-3xl font-bold text-amber-600">{data.pendingFollowUps}</p>
            <p className="text-sm text-gray-500 mt-1">Requiring attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Regional Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Regional Distribution</CardTitle>
            <CardDescription>Patient distribution across Ghana&apos;s 16 regions</CardDescription>
          </CardHeader>
          <CardContent>
            {data.regionalDistribution.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {data.regionalDistribution.slice(0, 10).map((item) => {
                  const percentage = Math.round((item.count / data.totalPatients) * 100);
                  return (
                    <div key={item.region}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700">{getRegionLabel(item.region)}</span>
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

        {/* Cleft Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Cleft Type Distribution</CardTitle>
            <CardDescription>Primary diagnosis classification</CardDescription>
          </CardHeader>
          <CardContent>
            {data.cleftTypeDistribution.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No diagnosis data available</p>
            ) : (
              <div className="space-y-4">
                {data.cleftTypeDistribution.map((item) => {
                  const percentage = Math.round((item.count / totalCleftCases) * 100);
                  return (
                    <div key={item.cleftType} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{getCleftTypeLabel(item.cleftType)}</span>
                        <span className="text-2xl font-bold text-emerald-600">{percentage}%</span>
                      </div>
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-500 mt-2">{item.count} patients</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Surgery Types & Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Surgery Types */}
        <Card>
          <CardHeader>
            <CardTitle>Surgery Types</CardTitle>
            <CardDescription>Distribution of procedures performed</CardDescription>
          </CardHeader>
          <CardContent>
            {data.surgeryTypeDistribution.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No surgery data available</p>
            ) : (
              <div className="space-y-3">
                {data.surgeryTypeDistribution.map((item) => {
                  const percentage = totalSurgeryTypes > 0 
                    ? Math.round((item.count / totalSurgeryTypes) * 100) 
                    : 0;
                  return (
                    <div key={item.surgeryType} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm">{getSurgeryTypeLabel(item.surgeryType)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{item.count}</span>
                        <span className="text-xs text-gray-500 w-12 text-right">{percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Registrations */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Registrations</CardTitle>
            <CardDescription>Patient registration trend (last 12 months)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.monthlyRegistrations.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No registration data available</p>
            ) : (
              <div className="space-y-2">
                {data.monthlyRegistrations.map((item) => {
                  const maxCount = Math.max(...data.monthlyRegistrations.map(m => m.count));
                  const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                  return (
                    <div key={item.month} className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 w-20">{item.month}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(percentage, 10)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{item.count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Data Exports & Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
              <span className="text-2xl">📊</span>
              <p className="font-medium mt-2">CRANE Format Report</p>
              <p className="text-sm text-gray-500">Annual outcome audit</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
              <span className="text-2xl">📋</span>
              <p className="font-medium mt-2">Smile Train Report</p>
              <p className="text-sm text-gray-500">Donor activity report</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
              <span className="text-2xl">📈</span>
              <p className="font-medium mt-2">KPI Dashboard</p>
              <p className="text-sm text-gray-500">Quality indicators</p>
            </button>
            <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left">
              <span className="text-2xl">📁</span>
              <p className="font-medium mt-2">Export CSV</p>
              <p className="text-sm text-gray-500">Raw data export</p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

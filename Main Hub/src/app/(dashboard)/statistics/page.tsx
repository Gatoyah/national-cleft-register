import { db, patients, surgeries, diagnoses, facilities } from "@/db";
import { eq, count, sql, gte, and, between, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { getRegionLabel, getCleftTypeLabel, getSurgeryTypeLabel } from "@/lib/utils";
import { YearSelect } from "@/components/YearSelect";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

async function getYearlyStats(year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const [
    birthsResult,
    surgeriesResult,
    cleftTypeResult,
    sexResult,
    regionResult,
    surgeryTypeResult,
    facilityResult,
  ] = await Promise.all([
    // Total births this year
    db.select({ count: count() }).from(patients).where(
      sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`
    ),
    // Total surgeries this year
    db.select({ count: count() }).from(surgeries).where(
      between(surgeries.surgeryDate, startDate, endDate)
    ),
    // Cleft type breakdown
    db.select({
      cleftType: diagnoses.cleftType,
      count: count(),
    }).from(diagnoses)
      .innerJoin(patients, eq(diagnoses.patientId, patients.id))
      .where(
        and(
          eq(diagnoses.isPrimaryDiagnosis, true),
          sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`
        )
      )
      .groupBy(diagnoses.cleftType),
    // Sex breakdown
    db.select({
      sex: patients.sex,
      count: count(),
    }).from(patients)
      .where(sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`)
      .groupBy(patients.sex),
    // Regional breakdown
    db.select({
      region: patients.regionOfResidence,
      count: count(),
    }).from(patients)
      .where(sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`)
      .groupBy(patients.regionOfResidence)
      .orderBy(desc(count())),
    // Surgery type breakdown
    db.select({
      surgeryType: surgeries.surgeryType,
      count: count(),
    }).from(surgeries)
      .where(between(surgeries.surgeryDate, startDate, endDate))
      .groupBy(surgeries.surgeryType)
      .orderBy(desc(count())),
    // By facility
    db.select({
      facilityId: surgeries.facilityId,
      facilityName: facilities.name,
      count: count(),
    }).from(surgeries)
      .leftJoin(facilities, eq(surgeries.facilityId, facilities.id))
      .where(between(surgeries.surgeryDate, startDate, endDate))
      .groupBy(surgeries.facilityId, facilities.name)
      .orderBy(desc(count())),
  ]);

  return {
    totalBirths: birthsResult[0]?.count || 0,
    totalSurgeries: surgeriesResult[0]?.count || 0,
    cleftTypes: cleftTypeResult,
    sexBreakdown: sexResult,
    regionalBreakdown: regionResult,
    surgeryTypes: surgeryTypeResult,
    facilityBreakdown: facilityResult,
  };
}

async function getQuarterlyData(year: number) {
  const quarters = [];
  for (let q = 1; q <= 4; q++) {
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${endMonth === 2 ? "28" : endMonth % 2 === 0 && endMonth !== 12 ? "30" : "31"}`;

    const [birthsResult, surgeriesResult] = await Promise.all([
      db.select({ count: count() }).from(patients).where(
        sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`
      ),
      db.select({ count: count() }).from(surgeries).where(
        between(surgeries.surgeryDate, startDate, endDate)
      ),
    ]);

    quarters.push({
      quarter: `Q${q}`,
      births: birthsResult[0]?.count || 0,
      surgeries: surgeriesResult[0]?.count || 0,
    });
  }
  return quarters;
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const selectedYear = parseInt(params.year || String(currentYear), 10);

  const [stats, quarterlyData] = await Promise.all([
    getYearlyStats(selectedYear),
    getQuarterlyData(selectedYear),
  ]);

  const totalCleftTypes = stats.cleftTypes.reduce((sum, c) => sum + c.count, 0);
  const totalSex = stats.sexBreakdown.reduce((sum, s) => sum + s.count, 0);

  // Generate year options
  const yearOptions = [];
  for (let y = currentYear; y >= 2020; y--) {
    yearOptions.push(y);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistics & Reports</h1>
          <p className="text-gray-500 mt-1">Cleft birth and surgery data for Smile Train reporting</p>
        </div>
        <div className="flex items-center gap-4">
          <YearSelect years={yearOptions} selectedYear={selectedYear} />
          <Button variant="outline">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </Button>
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-blue-700">Total Cleft Births in {selectedYear}</p>
            <p className="text-4xl font-bold text-blue-900 mt-2">{stats.totalBirths.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-emerald-700">Total Surgeries in {selectedYear}</p>
            <p className="text-4xl font-bold text-emerald-900 mt-2">{stats.totalSurgeries.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-purple-700">Surgery Rate</p>
            <p className="text-4xl font-bold text-purple-900 mt-2">
              {stats.totalBirths > 0 
                ? Math.round((stats.totalSurgeries / stats.totalBirths) * 100) 
                : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quarterly Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Quarterly Breakdown - {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead className="text-right">Cleft Births</TableHead>
                <TableHead className="text-right">Surgeries</TableHead>
                <TableHead className="text-right">Surgery Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quarterlyData.map((q) => (
                <TableRow key={q.quarter}>
                  <TableCell className="font-medium">{q.quarter} {selectedYear}</TableCell>
                  <TableCell className="text-right">{q.births}</TableCell>
                  <TableCell className="text-right">{q.surgeries}</TableCell>
                  <TableCell className="text-right">
                    {q.births > 0 ? Math.round((q.surgeries / q.births) * 100) : 0}%
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-gray-50 font-bold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{stats.totalBirths}</TableCell>
                <TableCell className="text-right">{stats.totalSurgeries}</TableCell>
                <TableCell className="text-right">
                  {stats.totalBirths > 0 
                    ? Math.round((stats.totalSurgeries / stats.totalBirths) * 100) 
                    : 0}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cleft Type Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>By Cleft Type</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.cleftTypes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500">No data</TableCell>
                  </TableRow>
                ) : (
                  stats.cleftTypes.map((item) => (
                    <TableRow key={item.cleftType}>
                      <TableCell>{getCleftTypeLabel(item.cleftType)}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right">
                        {totalCleftTypes > 0 ? Math.round((item.count / totalCleftTypes) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sex Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>By Sex</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sex</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.sexBreakdown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-500">No data</TableCell>
                  </TableRow>
                ) : (
                  stats.sexBreakdown.map((item) => (
                    <TableRow key={item.sex}>
                      <TableCell className="capitalize">{item.sex}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right">
                        {totalSex > 0 ? Math.round((item.count / totalSex) * 100) : 0}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Regional Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>By Region</CardTitle>
          <CardDescription>Cleft births registered per region in {selectedYear}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Births</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.regionalBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-gray-500">No data</TableCell>
                </TableRow>
              ) : (
                stats.regionalBreakdown.map((item) => (
                  <TableRow key={item.region}>
                    <TableCell>{getRegionLabel(item.region)}</TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right">
                      {stats.totalBirths > 0 ? Math.round((item.count / stats.totalBirths) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Surgery Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Surgeries by Type</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Surgery Type</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.surgeryTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-gray-500">No surgeries recorded</TableCell>
                </TableRow>
              ) : (
                stats.surgeryTypes.map((item) => (
                  <TableRow key={item.surgeryType}>
                    <TableCell>{getSurgeryTypeLabel(item.surgeryType)}</TableCell>
                    <TableCell className="text-right">{item.count}</TableCell>
                    <TableCell className="text-right">
                      {stats.totalSurgeries > 0 ? Math.round((item.count / stats.totalSurgeries) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

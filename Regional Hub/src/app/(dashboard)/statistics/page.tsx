import { db, patients, surgeries, diagnoses } from "@/db";
import { count, eq, gte, sql, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { getRegionLabel, getCleftTypeLabel, getSurgeryTypeLabel } from "@/lib/utils";
import { YearSelect } from "@/components/YearSelect";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

async function getStatistics(year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const [
    totalBirths,
    totalSurgeries,
    bySex,
    byCleftType,
    byRegion,
    bySurgeryType,
  ] = await Promise.all([
    db.select({ count: count() }).from(patients).where(sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`),
    db.select({ count: count() }).from(surgeries).where(sql`${surgeries.surgeryDate} BETWEEN ${startDate} AND ${endDate}`),
    db.select({ sex: patients.sex, count: count() }).from(patients).where(sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`).groupBy(patients.sex),
    db.select({ cleftType: diagnoses.cleftType, count: count() }).from(diagnoses).innerJoin(patients, eq(diagnoses.patientId, patients.id)).where(sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`).groupBy(diagnoses.cleftType),
    db.select({ region: patients.regionOfResidence, count: count() }).from(patients).where(sql`DATE(${patients.createdAt}) BETWEEN ${startDate} AND ${endDate}`).groupBy(patients.regionOfResidence).orderBy(desc(count())),
    db.select({ surgeryType: surgeries.surgeryType, count: count() }).from(surgeries).where(sql`${surgeries.surgeryDate} BETWEEN ${startDate} AND ${endDate}`).groupBy(surgeries.surgeryType).orderBy(desc(count())),
  ]);

  return {
    totalBirths: totalBirths[0]?.count || 0,
    totalSurgeries: totalSurgeries[0]?.count || 0,
    bySex,
    byCleftType,
    byRegion,
    bySurgeryType,
  };
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const selectedYear = parseInt(params.year || String(currentYear), 10);
  
  const stats = await getStatistics(selectedYear);
  
  const totalSex = stats.bySex.reduce((sum, s) => sum + s.count, 0);
  const totalCleft = stats.byCleftType.reduce((sum, c) => sum + c.count, 0);

  const years = [];
  for (let y = currentYear; y >= 2020; y--) years.push(y);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistics</h1>
          <p className="text-gray-500 mt-1">Cleft birth and surgery data for {selectedYear}</p>
        </div>
        <div className="flex items-center gap-4">
          <YearSelect years={years} selectedYear={selectedYear} />
          <Button variant="outline">Export CSV</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-700">Cleft Births in {selectedYear}</p>
            <p className="text-4xl font-bold text-blue-900 mt-2">{stats.totalBirths}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="pt-6">
            <p className="text-sm text-emerald-700">Surgeries in {selectedYear}</p>
            <p className="text-4xl font-bold text-emerald-900 mt-2">{stats.totalSurgeries}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-6">
            <p className="text-sm text-purple-700">Surgery Rate</p>
            <p className="text-4xl font-bold text-purple-900 mt-2">
              {stats.totalBirths > 0 ? Math.round((stats.totalSurgeries / stats.totalBirths) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Sex */}
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
                {stats.bySex.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-gray-500">No data</TableCell></TableRow>
                ) : (
                  stats.bySex.map((row) => (
                    <TableRow key={row.sex}>
                      <TableCell className="capitalize">{row.sex}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{totalSex > 0 ? Math.round((row.count / totalSex) * 100) : 0}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Cleft Type */}
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
                {stats.byCleftType.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-gray-500">No data</TableCell></TableRow>
                ) : (
                  stats.byCleftType.map((row) => (
                    <TableRow key={row.cleftType}>
                      <TableCell>{getCleftTypeLabel(row.cleftType)}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">{totalCleft > 0 ? Math.round((row.count / totalCleft) * 100) : 0}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* By Region */}
      <Card>
        <CardHeader>
          <CardTitle>By Region</CardTitle>
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
              {stats.byRegion.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-gray-500">No data</TableCell></TableRow>
              ) : (
                stats.byRegion.map((row) => (
                  <TableRow key={row.region}>
                    <TableCell>{getRegionLabel(row.region)}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{stats.totalBirths > 0 ? Math.round((row.count / stats.totalBirths) * 100) : 0}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By Surgery Type */}
      <Card>
        <CardHeader>
          <CardTitle>Surgery Types</CardTitle>
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
              {stats.bySurgeryType.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-gray-500">No surgeries</TableCell></TableRow>
              ) : (
                stats.bySurgeryType.map((row) => (
                  <TableRow key={row.surgeryType}>
                    <TableCell>{getSurgeryTypeLabel(row.surgeryType)}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{stats.totalSurgeries > 0 ? Math.round((row.count / stats.totalSurgeries) * 100) : 0}%</TableCell>
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

import { requirePagePermission } from "@/lib/auth";
import { db, surgeries, patients } from "@/db";
import { desc, eq, count } from "drizzle-orm";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getSurgeryTypeLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getSurgeries(page: number = 1) {
  const limit = 25;
  const offset = (page - 1) * limit;

  const [surgeryList, totalCount] = await Promise.all([
    db
      .select({
        id: surgeries.id,
        localId: surgeries.localId,
        patientId: surgeries.patientId,
        surgeryDate: surgeries.surgeryDate,
        surgeryType: surgeries.surgeryType,
        isPrimarySurgery: surgeries.isPrimarySurgery,
        surgeonName: surgeries.surgeonName,
        complications: surgeries.complications,
        dischargeCondition: surgeries.dischargeCondition,
        syncStatus: surgeries.syncStatus,
        patientFirstName: patients.firstName,
        patientLastName: patients.lastName,
      })
      .from(surgeries)
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .orderBy(desc(surgeries.surgeryDate))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(surgeries),
  ]);

  return {
    surgeries: surgeryList,
    total: totalCount[0]?.count || 0,
    page,
    limit,
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SurgeriesPage({ searchParams }: PageProps) {
  await requirePagePermission("surgeries.view");
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const { surgeries: surgeryList, total, limit } = await getSurgeries(page);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surgeries</h1>
          <p className="text-gray-500 mt-1">{total} surgeries recorded</p>
        </div>
        <Link href="/surgeries/new">
          <Button>Record Surgery</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Surgery Type</TableHead>
              <TableHead>Surgeon</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sync</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surgeryList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                  No surgeries recorded yet
                </TableCell>
              </TableRow>
            ) : (
              surgeryList.map((surgery) => (
                <TableRow key={surgery.id}>
                  <TableCell>{formatDate(surgery.surgeryDate)}</TableCell>
                  <TableCell>
                    <Link href={`/patients/${surgery.patientId}`} className="text-emerald-600 hover:underline">
                      {surgery.patientFirstName} {surgery.patientLastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getSurgeryTypeLabel(surgery.surgeryType)}
                      {surgery.isPrimarySurgery && <Badge variant="info">Primary</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{surgery.surgeonName || "—"}</TableCell>
                  <TableCell>
                    {surgery.complications ? (
                      <Badge variant="danger">Complications</Badge>
                    ) : surgery.dischargeCondition ? (
                      <Badge variant="success">{surgery.dischargeCondition}</Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={surgery.syncStatus === "synced" ? "success" : surgery.syncStatus === "failed" ? "danger" : "warning"}>
                      {surgery.syncStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/surgeries?page=${page - 1}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/surgeries?page=${page + 1}`}>
                  <Button variant="outline" size="sm">Next</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

import { db, surgeries, patients, users } from "@/db";
import { desc, eq, count } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getSurgeryTypeLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

async function getSurgeries(page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;

  const [surgeryList, countResult] = await Promise.all([
    db
      .select({
        id: surgeries.id,
        patientId: surgeries.patientId,
        surgeryDate: surgeries.surgeryDate,
        surgeryType: surgeries.surgeryType,
        isPrimarySurgery: surgeries.isPrimarySurgery,
        lipTechnique: surgeries.lipTechnique,
        palateTechnique: surgeries.palateTechnique,
        dischargeCondition: surgeries.dischargeCondition,
        patientFirstName: patients.firstName,
        patientLastName: patients.lastName,
        patientNcrId: patients.ncrId,
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
    total: countResult[0]?.count || 0,
    page,
    limit,
  };
}

export default async function SurgeriesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const { surgeries: surgeryList, total, limit } = await getSurgeries(page);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surgeries</h1>
          <p className="text-gray-500 mt-1">{total.toLocaleString()} surgeries recorded</p>
        </div>
        <Link href="/surgeries/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Record Surgery
          </Button>
        </Link>
      </div>

      <Card noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Surgery Type</TableHead>
              <TableHead>Technique</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surgeryList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                  No surgeries recorded yet.{" "}
                  <Link href="/surgeries/new" className="text-emerald-600 hover:underline">
                    Record the first surgery
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              surgeryList.map((surgery) => (
                <TableRow key={surgery.id}>
                  <TableCell>{formatDate(surgery.surgeryDate)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/patients/${surgery.patientId}`}
                      className="text-emerald-600 hover:underline"
                    >
                      {surgery.patientFirstName} {surgery.patientLastName}
                    </Link>
                    <p className="text-xs text-gray-500">{surgery.patientNcrId}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getSurgeryTypeLabel(surgery.surgeryType)}
                      {surgery.isPrimarySurgery && (
                        <Badge variant="info" className="text-xs">Primary</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {surgery.lipTechnique || surgery.palateTechnique || "—"}
                  </TableCell>
                  <TableCell>
                    {surgery.dischargeCondition ? (
                      <Badge variant="success">{surgery.dischargeCondition}</Badge>
                    ) : (
                      <Badge variant="warning">In Progress</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/surgeries/${surgery.id}`}
                      className="text-gray-600 hover:text-emerald-600"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} surgeries
            </p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link href={`/surgeries?page=${page - 1}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              )}
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
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

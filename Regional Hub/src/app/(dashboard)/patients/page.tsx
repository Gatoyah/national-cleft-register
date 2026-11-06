import { requirePagePermission } from "@/lib/auth";
import { db, patients } from "@/db";
import { desc, ilike, or, count } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getRegionLabel, calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

async function getPatients(search?: string, page: number = 1) {
  const limit = 25;
  const offset = (page - 1) * limit;

  let query = db
    .select()
    .from(patients)
    .$dynamic();

  if (search) {
    query = query.where(
      or(
        ilike(patients.firstName, `%${search}%`),
        ilike(patients.lastName, `%${search}%`),
        ilike(patients.caregiverPhone, `%${search}%`)
      )
    );
  }

  const [patientList, countResult] = await Promise.all([
    query.orderBy(desc(patients.createdAt)).limit(limit).offset(offset),
    db.select({ count: count() }).from(patients),
  ]);

  return {
    patients: patientList,
    total: countResult[0]?.count || 0,
    page,
    limit,
  };
}

export default async function PatientsPage({ searchParams }: PageProps) {
  await requirePagePermission("patients.view");
  const params = await searchParams;
  const search = params.search || "";
  const page = parseInt(params.page || "1", 10);
  const { patients: patientList, total, limit } = await getPatients(search, page);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Registry</h1>
          <p className="text-gray-500 mt-1">{total} cleft births registered</p>
        </div>
        <Link href="/patients/new">
          <Button>Register New Birth</Button>
        </Link>
      </div>

      {/* Search */}
      <Card>
        <CardContent>
          <form className="flex gap-4">
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Search by name or phone..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <Button type="submit" variant="secondary">Search</Button>
          </form>
        </CardContent>
      </Card>

      {/* Patient Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Sex</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Caregiver</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patientList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-gray-500 py-12">
                  {search ? "No patients found" : "No patients registered yet"}
                </TableCell>
              </TableRow>
            ) : (
              patientList.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-mono text-sm">
                    {patient.ncrId || patient.localId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {patient.firstName} {patient.lastName}
                  </TableCell>
                  <TableCell className="capitalize">{patient.sex}</TableCell>
                  <TableCell>{calculateAge(patient.dateOfBirth)}</TableCell>
                  <TableCell>{getRegionLabel(patient.regionOfResidence)}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{patient.caregiverName}</p>
                      {patient.caregiverPhone && (
                        <p className="text-xs text-gray-500">{patient.caregiverPhone}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(patient.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={
                      patient.syncStatus === "synced" ? "success" :
                      patient.syncStatus === "failed" ? "danger" : "warning"
                    }>
                      {patient.syncStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/patients/${patient.id}`} className="text-emerald-600 hover:underline text-sm">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/patients?page=${page - 1}${search ? `&search=${search}` : ""}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/patients?page=${page + 1}${search ? `&search=${search}` : ""}`}>
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

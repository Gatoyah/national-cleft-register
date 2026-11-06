import { requirePagePermission } from "@/lib/auth";
import { db, patients, diagnoses } from "@/db";
import { desc, like, or, and, eq, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getRegionLabel, getCleftTypeLabel, calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ search?: string; region?: string; page?: string }>;
}

async function getPatients(search?: string, region?: string, page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = db
    .select({
      id: patients.id,
      ncrId: patients.ncrId,
      firstName: patients.firstName,
      lastName: patients.lastName,
      dateOfBirth: patients.dateOfBirth,
      sex: patients.sex,
      regionOfResidence: patients.regionOfResidence,
      districtOfResidence: patients.districtOfResidence,
      caregiverPhone: patients.caregiverPhone,
      isLostToFollowUp: patients.isLostToFollowUp,
      isDeceased: patients.isDeceased,
      createdAt: patients.createdAt,
    })
    .from(patients)
    .$dynamic();

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(patients.firstName, `%${search}%`),
        like(patients.lastName, `%${search}%`),
        like(patients.ncrId, `%${search}%`),
        like(patients.nhisNumber, `%${search}%`)
      )
    );
  }

  if (region) {
    conditions.push(eq(patients.regionOfResidence, region as typeof patients.regionOfResidence.enumValues[number]));
  }

  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
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
  const region = params.region || "";
  const page = parseInt(params.page || "1", 10);

  const { patients: patientList, total, limit } = await getPatients(search, region, page);
  const totalPages = Math.ceil(total / limit);

  const regions = [
    { value: "", label: "All Regions" },
    { value: "ashanti", label: "Ashanti" },
    { value: "greater_accra", label: "Greater Accra" },
    { value: "northern", label: "Northern" },
    { value: "western", label: "Western" },
    { value: "eastern", label: "Eastern" },
    { value: "central", label: "Central" },
    { value: "volta", label: "Volta" },
    { value: "upper_east", label: "Upper East" },
    { value: "upper_west", label: "Upper West" },
    { value: "bono", label: "Bono" },
    { value: "bono_east", label: "Bono East" },
    { value: "ahafo", label: "Ahafo" },
    { value: "western_north", label: "Western North" },
    { value: "oti", label: "Oti" },
    { value: "north_east", label: "North East" },
    { value: "savannah", label: "Savannah" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="text-gray-500 mt-1">{total.toLocaleString()} patients registered</p>
        </div>
        <Link href="/patients/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register Patient
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <form className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Search by name, NCR ID, or NHIS number..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <select
              name="region"
              defaultValue={region}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {regions.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Patient Table */}
      <Card noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>NCR ID</TableHead>
              <TableHead>Patient Name</TableHead>
              <TableHead>Sex</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patientList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-12">
                  {search || region ? (
                    <>
                      No patients found matching your search.{" "}
                      <Link href="/patients" className="text-emerald-600 hover:underline">
                        Clear filters
                      </Link>
                    </>
                  ) : (
                    <>
                      No patients registered yet.{" "}
                      <Link href="/patients/new" className="text-emerald-600 hover:underline">
                        Register the first patient
                      </Link>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              patientList.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <Link
                      href={`/patients/${patient.id}`}
                      className="text-emerald-600 hover:underline font-medium"
                    >
                      {patient.ncrId}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">
                    {patient.firstName} {patient.lastName}
                  </TableCell>
                  <TableCell className="capitalize">{patient.sex}</TableCell>
                  <TableCell>{calculateAge(patient.dateOfBirth)}</TableCell>
                  <TableCell>{getRegionLabel(patient.regionOfResidence)}</TableCell>
                  <TableCell>{patient.caregiverPhone || "—"}</TableCell>
                  <TableCell>
                    {patient.isDeceased ? (
                      <Badge variant="danger">Deceased</Badge>
                    ) : patient.isLostToFollowUp ? (
                      <Badge variant="warning">Lost to F/U</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/patients/${patient.id}`}
                        className="text-gray-600 hover:text-emerald-600"
                      >
                        View
                      </Link>
                      <Link
                        href={`/patients/${patient.id}/edit`}
                        className="text-gray-600 hover:text-emerald-600"
                      >
                        Edit
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} patients
            </p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link
                  href={`/patients?page=${page - 1}${search ? `&search=${search}` : ""}${region ? `&region=${region}` : ""}`}
                >
                  <Button variant="outline" size="sm">
                    Previous
                  </Button>
                </Link>
              )}
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/patients?page=${page + 1}${search ? `&search=${search}` : ""}${region ? `&region=${region}` : ""}`}
                >
                  <Button variant="outline" size="sm">
                    Next
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

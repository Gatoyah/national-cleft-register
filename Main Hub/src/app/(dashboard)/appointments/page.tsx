import { requirePagePermission } from "@/lib/auth";
import { db, appointments, patients } from "@/db";
import { desc, eq, gte, and, count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ view?: string; page?: string }>;
}

async function getAppointments(view: string = "upcoming", page: number = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const today = new Date().toISOString().split("T")[0];

  let query = db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      scheduledDate: appointments.scheduledDate,
      scheduledTime: appointments.scheduledTime,
      visitType: appointments.visitType,
      appointmentType: appointments.appointmentType,
      department: appointments.department,
      status: appointments.status,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientNcrId: patients.ncrId,
    })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.id))
    .$dynamic();

  if (view === "upcoming") {
    query = query.where(
      and(
        eq(appointments.status, "scheduled"),
        gte(appointments.scheduledDate, today)
      )
    );
  } else if (view === "missed") {
    query = query.where(eq(appointments.status, "missed"));
  } else if (view === "completed") {
    query = query.where(eq(appointments.status, "completed"));
  }

  const [appointmentList, countResult] = await Promise.all([
    query.orderBy(desc(appointments.scheduledDate)).limit(limit).offset(offset),
    db.select({ count: count() }).from(appointments),
  ]);

  return {
    appointments: appointmentList,
    total: countResult[0]?.count || 0,
    page,
    limit,
  };
}

export default async function AppointmentsPage({ searchParams }: PageProps) {
  await requirePagePermission("appointments.view");
  const params = await searchParams;
  const view = params.view || "upcoming";
  const page = parseInt(params.page || "1", 10);
  const { appointments: appointmentList, total, limit } = await getAppointments(view, page);
  const totalPages = Math.ceil(total / limit);

  const views = [
    { value: "upcoming", label: "Upcoming" },
    { value: "completed", label: "Completed" },
    { value: "missed", label: "Missed" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-500 mt-1">Manage patient appointments and follow-ups</p>
        </div>
        <Link href="/appointments/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Schedule Appointment
          </Button>
        </Link>
      </div>

      {/* View Tabs */}
      <div className="flex gap-2">
        {views.map((v) => (
          <Link key={v.value} href={`/appointments?view=${v.value}`}>
            <Button variant={view === v.value ? "primary" : "outline"} size="sm">
              {v.label}
            </Button>
          </Link>
        ))}
      </div>

      <Card noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointmentList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                  No appointments found.{" "}
                  <Link href="/appointments/new" className="text-emerald-600 hover:underline">
                    Schedule an appointment
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              appointmentList.map((apt) => (
                <TableRow key={apt.id}>
                  <TableCell>{formatDate(apt.scheduledDate)}</TableCell>
                  <TableCell>{apt.scheduledTime || "—"}</TableCell>
                  <TableCell>
                    <Link
                      href={`/patients/${apt.patientId}`}
                      className="text-emerald-600 hover:underline"
                    >
                      {apt.patientFirstName} {apt.patientLastName}
                    </Link>
                    <p className="text-xs text-gray-500">{apt.patientNcrId}</p>
                  </TableCell>
                  <TableCell className="capitalize">
                    {apt.appointmentType || apt.visitType}
                  </TableCell>
                  <TableCell>{apt.department || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        apt.status === "completed"
                          ? "success"
                          : apt.status === "missed"
                          ? "danger"
                          : apt.status === "cancelled"
                          ? "warning"
                          : "info"
                      }
                    >
                      {apt.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/appointments/${apt.id}`}
                        className="text-gray-600 hover:text-emerald-600"
                      >
                        View
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link href={`/appointments?view=${view}&page=${page - 1}`}>
                  <Button variant="outline" size="sm">Previous</Button>
                </Link>
              )}
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link href={`/appointments?view=${view}&page=${page + 1}`}>
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

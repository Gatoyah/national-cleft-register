import { db, followUpAlerts, patients } from "@/db";
import { desc, eq, count, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

async function getAlerts(filter: string = "pending") {
  const conditions = filter === "pending" 
    ? eq(followUpAlerts.isResolved, false)
    : filter === "resolved"
    ? eq(followUpAlerts.isResolved, true)
    : undefined;

  const alertList = await db
    .select({
      id: followUpAlerts.id,
      patientId: followUpAlerts.patientId,
      alertType: followUpAlerts.alertType,
      alertDate: followUpAlerts.alertDate,
      priority: followUpAlerts.priority,
      message: followUpAlerts.message,
      isResolved: followUpAlerts.isResolved,
      resolvedDate: followUpAlerts.resolvedDate,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      patientNcrId: patients.ncrId,
      patientPhone: patients.caregiverPhone,
    })
    .from(followUpAlerts)
    .leftJoin(patients, eq(followUpAlerts.patientId, patients.id))
    .where(conditions)
    .orderBy(desc(followUpAlerts.alertDate))
    .limit(50);

  const [pendingCount] = await db
    .select({ count: count() })
    .from(followUpAlerts)
    .where(eq(followUpAlerts.isResolved, false));

  return {
    alerts: alertList,
    pendingCount: pendingCount?.count || 0,
  };
}

export default async function AlertsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filter = params.filter || "pending";
  const { alerts, pendingCount } = await getAlerts(filter);

  const priorityOrder = { high: 0, medium: 1, low: 2, normal: 3 };
  const sortedAlerts = [...alerts].sort((a, b) => {
    const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
    const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;
    return aPriority - bPriority;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-up Alerts</h1>
          <p className="text-gray-500 mt-1">
            {pendingCount} pending alerts requiring attention
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Link href="/alerts?filter=pending">
          <Button variant={filter === "pending" ? "primary" : "outline"} size="sm">
            Pending ({pendingCount})
          </Button>
        </Link>
        <Link href="/alerts?filter=resolved">
          <Button variant={filter === "resolved" ? "primary" : "outline"} size="sm">
            Resolved
          </Button>
        </Link>
        <Link href="/alerts?filter=all">
          <Button variant={filter === "all" ? "primary" : "outline"} size="sm">
            All
          </Button>
        </Link>
      </div>

      {/* Alerts Grid */}
      {sortedAlerts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <span className="text-4xl">✓</span>
            <p className="text-gray-600 mt-4">
              {filter === "pending" 
                ? "No pending alerts. Great job keeping up with follow-ups!"
                : "No alerts found."
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAlerts.map((alert) => (
            <Card key={alert.id}>
              <CardContent>
                <div className="flex items-start justify-between mb-3">
                  <Badge
                    variant={
                      alert.priority === "high"
                        ? "danger"
                        : alert.priority === "medium"
                        ? "warning"
                        : "default"
                    }
                  >
                    {alert.priority || "normal"} priority
                  </Badge>
                  {alert.isResolved && (
                    <Badge variant="success">Resolved</Badge>
                  )}
                </div>

                <Link
                  href={`/patients/${alert.patientId}`}
                  className="font-semibold text-gray-900 hover:text-emerald-600"
                >
                  {alert.patientFirstName} {alert.patientLastName}
                </Link>
                <p className="text-sm text-gray-500">{alert.patientNcrId}</p>

                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700">{alert.alertType}</p>
                  {alert.message && (
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {formatDate(alert.alertDate)}
                  </span>
                  {alert.patientPhone && (
                    <a
                      href={`tel:${alert.patientPhone}`}
                      className="text-emerald-600 hover:underline"
                    >
                      📞 {alert.patientPhone}
                    </a>
                  )}
                </div>

                {!alert.isResolved && (
                  <div className="mt-4 flex gap-2">
                    <form action={`/api/alerts/${alert.id}/resolve`} method="POST" className="flex-1">
                      <Button type="submit" variant="outline" size="sm" className="w-full">
                        Mark Resolved
                      </Button>
                    </form>
                    <Link href={`/patients/${alert.patientId}`} className="flex-1">
                      <Button variant="primary" size="sm" className="w-full">
                        View Patient
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

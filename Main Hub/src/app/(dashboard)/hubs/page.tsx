import { RotateKeyButton } from "@/components/RotateKeyButton";
import { requirePagePermission } from "@/lib/auth";
import { db, facilities, patients, surgeries } from "@/db";
import { eq, count, desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { getRegionLabel, getFacilityTypeLabel, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getHubsWithStats() {
  const hubList = await db
    .select()
    .from(facilities)
    .where(eq(facilities.isActive, true))
    .orderBy(desc(facilities.createdAt));

  const hubsWithStats = await Promise.all(
    hubList.map(async (hub) => {
      const [patientCount, surgeryCount] = await Promise.all([
        db.select({ count: count() }).from(patients).where(eq(patients.registeredAtFacilityId, hub.id)),
        db.select({ count: count() }).from(surgeries).where(eq(surgeries.facilityId, hub.id)),
      ]);

      return {
        ...hub,
        patientCount: patientCount[0]?.count || 0,
        surgeryCount: surgeryCount[0]?.count || 0,
        lastSync: null as Date | null, // Would come from sync logs
      };
    })
  );

  return hubsWithStats;
}

export default async function HubsPage() {
  await requirePagePermission("hubs.manage");
  const hubs = await getHubsWithStats();

  const hubsByType = {
    hub: hubs.filter((h) => h.facilityType === "hub"),
    co_hub: hubs.filter((h) => h.facilityType === "co_hub"),
    regional_centre: hubs.filter((h) => h.facilityType === "regional_centre"),
    other: hubs.filter((h) => !["hub", "co_hub", "regional_centre"].includes(h.facilityType)),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Regional Hubs</h1>
          <p className="text-gray-500 mt-1">Connected facilities in the National Cleft Registry network</p>
        </div>
        <Link href="/hubs/new">
          <Button>Add Regional Hub</Button>
        </Link>
      </div>

      {/* Hub Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Main Hub</p>
            <p className="text-2xl font-bold">{hubsByType.hub.length}</p>
            <p className="text-xs text-gray-400 mt-1">KATH</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Co-Hubs</p>
            <p className="text-2xl font-bold">{hubsByType.co_hub.length}</p>
            <p className="text-xs text-gray-400 mt-1">Korle Bu, Tamale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Regional Centres</p>
            <p className="text-2xl font-bold">{hubsByType.regional_centre.length}</p>
            <p className="text-xs text-gray-400 mt-1">Across 16 regions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Total Active</p>
            <p className="text-2xl font-bold">{hubs.length}</p>
            <p className="text-xs text-gray-400 mt-1">All facilities</p>
          </CardContent>
        </Card>
      </div>

      {/* Network Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Hub-and-Spoke Network</CardTitle>
          <CardDescription>Data flows from regional facilities to the main hub at KATH</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex flex-col items-center">
              {/* Main Hub */}
              <div className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium">
                KATH - Main Hub (Ashanti)
              </div>
              <div className="w-px h-8 bg-gray-300"></div>
              
              {/* Co-Hubs */}
              <div className="flex gap-8">
                <div className="flex flex-col items-center">
                  <div className="w-px h-8 bg-gray-300"></div>
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                    Korle Bu (Greater Accra)
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-px h-8 bg-gray-300"></div>
                  <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">
                    Tamale TH (Northern)
                  </div>
                </div>
              </div>
              
              <div className="w-px h-8 bg-gray-300"></div>
              
              {/* Regional Centres */}
              <div className="bg-gray-200 px-4 py-2 rounded-lg text-sm text-gray-700">
                16 Regional Referral Centres
              </div>
              
              <div className="w-px h-8 bg-gray-300"></div>
              
              {/* District Level */}
              <div className="bg-gray-100 px-4 py-2 rounded-lg text-sm text-gray-600">
                District Hospitals, CHPS, NGOs, Mission Hospitals
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Facilities Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Facilities</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Facility</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Patients</TableHead>
                <TableHead className="text-right">Surgeries</TableHead>
                <TableHead>Sync Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hubs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                    No facilities configured
                  </TableCell>
                </TableRow>
              ) : (
                hubs.map((hub) => (
                  <TableRow key={hub.id}>
                    <TableCell className="font-medium">{hub.name}</TableCell>
                    <TableCell>
                      <code className="px-2 py-0.5 bg-gray-100 rounded text-sm">{hub.code}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          hub.facilityType === "hub"
                            ? "success"
                            : hub.facilityType === "co_hub"
                            ? "info"
                            : "default"
                        }
                      >
                        {getFacilityTypeLabel(hub.facilityType)}
                      </Badge>
                    </TableCell>
                    <TableCell>{getRegionLabel(hub.region)}</TableCell>
                    <TableCell className="text-right">{hub.patientCount}</TableCell>
                    <TableCell className="text-right">{hub.surgeryCount}</TableCell>
                    <TableCell>
                      {hub.hasInternet ? (
                        <span className="text-emerald-600 text-sm">Online</span>
                      ) : (
                        <span className="text-amber-600 text-sm">Offline</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <RotateKeyButton hubId={hub.id} code={hub.code} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* API Endpoints for Sub-Hubs */}
      <Card>
        <CardHeader>
          <CardTitle>API Endpoints for Regional Hubs</CardTitle>
          <CardDescription>
            These endpoints are used by regional hub applications to sync data with the main registry
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 font-mono text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">Sync patients from regional hub</p>
              <code className="text-emerald-700">POST /api/sync/patients</code>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">Sync surgeries from regional hub</p>
              <code className="text-emerald-700">POST /api/sync/surgeries</code>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">Get pending data for regional hub</p>
              <code className="text-emerald-700">GET /api/sync/pull?facilityId=&#123;id&#125;</code>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-xs mb-1">Register new regional hub</p>
              <code className="text-emerald-700">POST /api/hubs/register</code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

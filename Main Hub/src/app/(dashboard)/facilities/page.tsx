import { requirePagePermission } from "@/lib/auth";
import { db, facilities, users, patients } from "@/db";
import { count, eq, desc } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { getRegionLabel, getFacilityTypeLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getFacilities() {
  const facilityList = await db
    .select()
    .from(facilities)
    .orderBy(desc(facilities.createdAt));

  // Get counts for each facility
  const facilitiesWithStats = await Promise.all(
    facilityList.map(async (facility) => {
      const [userCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.facilityId, facility.id));
      
      const [patientCount] = await db
        .select({ count: count() })
        .from(patients)
        .where(eq(patients.currentFacilityId, facility.id));

      return {
        ...facility,
        userCount: userCount?.count || 0,
        patientCount: patientCount?.count || 0,
      };
    })
  );

  return facilitiesWithStats;
}

export default async function FacilitiesPage() {
  await requirePagePermission("facilities.view");
  const facilityList = await getFacilities();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facilities</h1>
          <p className="text-gray-500 mt-1">Manage registry network facilities</p>
        </div>
        <Link href="/facilities/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Facility
          </Button>
        </Link>
      </div>

      {/* Facility Type Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { type: "hub", label: "Hub", color: "bg-emerald-500" },
          { type: "co_hub", label: "Co-Hub", color: "bg-blue-500" },
          { type: "regional_centre", label: "Regional Centre", color: "bg-purple-500" },
          { type: "district_hospital", label: "District Hospital", color: "bg-amber-500" },
        ].map((item) => {
          const count = facilityList.filter((f) => f.facilityType === item.type).length;
          return (
            <Card key={item.type}>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-sm text-gray-500">{item.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Facility</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Patients</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facilityList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-12">
                  No facilities configured.{" "}
                  <Link href="/facilities/new" className="text-emerald-600 hover:underline">
                    Add the first facility
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              facilityList.map((facility) => (
                <TableRow key={facility.id}>
                  <TableCell className="font-medium">{facility.name}</TableCell>
                  <TableCell>
                    <code className="px-2 py-1 bg-gray-100 rounded text-sm">{facility.code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        facility.facilityType === "hub"
                          ? "success"
                          : facility.facilityType === "co_hub"
                          ? "info"
                          : "default"
                      }
                    >
                      {getFacilityTypeLabel(facility.facilityType)}
                    </Badge>
                  </TableCell>
                  <TableCell>{getRegionLabel(facility.region)}</TableCell>
                  <TableCell>{facility.userCount}</TableCell>
                  <TableCell>{facility.patientCount}</TableCell>
                  <TableCell>
                    {facility.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="danger">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/facilities/${facility.id}`}
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
      </Card>
    </div>
  );
}

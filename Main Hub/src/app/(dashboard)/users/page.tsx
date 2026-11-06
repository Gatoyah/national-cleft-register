import { requirePagePermission } from "@/lib/auth";
import { db, users, facilities } from "@/db";
import { desc, eq, count } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate, getUserRoleLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getUsers() {
  const userList = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      facilityName: facilities.name,
      facilityCode: facilities.code,
    })
    .from(users)
    .leftJoin(facilities, eq(users.facilityId, facilities.id))
    .orderBy(desc(users.createdAt));

  return userList;
}

async function getUserStats() {
  const [totalCount] = await db.select({ count: count() }).from(users);
  const [activeCount] = await db.select({ count: count() }).from(users).where(eq(users.isActive, true));
  
  const roleCounts = await db
    .select({
      role: users.role,
      count: count(),
    })
    .from(users)
    .groupBy(users.role);

  return {
    total: totalCount?.count || 0,
    active: activeCount?.count || 0,
    byRole: roleCounts,
  };
}

export default async function UsersPage() {
  await requirePagePermission("users.manage");
  const [userList, stats] = await Promise.all([getUsers(), getUserStats()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">Manage registry user accounts and access</p>
        </div>
        <Link href="/users/new">
          <Button>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Active Users</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
          </CardContent>
        </Card>
        {stats.byRole.slice(0, 2).map((item) => (
          <Card key={item.role}>
            <CardContent>
              <p className="text-sm text-gray-500">{getUserRoleLabel(item.role)}</p>
              <p className="text-2xl font-bold">{item.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                  No users found.{" "}
                  <Link href="/users/new" className="text-emerald-600 hover:underline">
                    Add the first user
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              userList.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.role === "admin"
                          ? "danger"
                          : user.role === "surgeon"
                          ? "info"
                          : user.role === "clinician"
                          ? "success"
                          : "default"
                      }
                    >
                      {getUserRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.facilityCode ? (
                      <span title={user.facilityName || ""}>{user.facilityCode}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="danger">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/users/${user.id}`}
                      className="text-gray-600 hover:text-emerald-600"
                    >
                      Edit
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

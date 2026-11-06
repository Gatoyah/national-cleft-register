import { requirePagePermission } from "@/lib/auth";
import { db, users } from "@/db";
import { desc, count, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getUsers() {
  const [userList, stats] = await Promise.all([
    db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt)),
    db.select({ count: count() }).from(users).where(eq(users.isActive, true)),
  ]);

  return { users: userList, activeCount: stats[0]?.count || 0 };
}

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  clinician: "Clinician",
  surgeon: "Surgeon",
  data_clerk: "Data Clerk",
  viewer: "Viewer",
};

export default async function UsersPage() {
  await requirePagePermission("users.manage");
  const { users: userList, activeCount } = await getUsers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">{activeCount} active users</p>
        </div>
        <Link href="/users/new">
          <Button>Add User</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {userList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              userList.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "danger" : user.role === "surgeon" ? "info" : "default"}>
                      {roleLabels[user.role] || user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "Never"}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "success" : "danger"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/users/${user.id}`} className="text-gray-600 hover:text-emerald-600">Edit</Link>
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

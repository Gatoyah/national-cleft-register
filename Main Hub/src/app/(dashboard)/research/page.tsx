import { hasPermission } from "@/lib/permissions";
import { requirePagePermission } from "@/lib/auth";
import { db, researchProjects, publications, dataExtracts } from "@/db";
import { desc, count, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getResearchData() {
  const [projects, pubs, extracts, projectCount, pubCount] = await Promise.all([
    db.select().from(researchProjects).orderBy(desc(researchProjects.createdAt)).limit(10),
    db.select().from(publications).orderBy(desc(publications.publicationDate)).limit(5),
    db.select().from(dataExtracts).orderBy(desc(dataExtracts.requestDate)).limit(5),
    db.select({ count: count() }).from(researchProjects),
    db.select({ count: count() }).from(publications),
  ]);

  return {
    projects,
    publications: pubs,
    dataExtracts: extracts,
    projectCount: projectCount[0]?.count || 0,
    publicationCount: pubCount[0]?.count || 0,
  };
}

export default async function ResearchPage() {
  const user = await requirePagePermission("research.view");
  const canFull = hasPermission(user.role, "export.full");
  const data = await getResearchData();

  const statusColors: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
    proposed: "default",
    ethics_pending: "warning",
    ethics_approved: "info",
    active: "success",
    completed: "success",
    published: "success",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Research & Publications</h1>
          <p className="text-gray-500 mt-1">Manage research projects, data extracts, and publications</p>
        </div>
      </div>

      {/* Data export for analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Download data for analysis (CSV)</CardTitle>
          <CardDescription>
            De-identified exports contain only patients whose caregivers consented to research. They have no names,
            phone or ID numbers, exact birth dates, towns or GPS; each patient has a stable pseudonymous research ID.
            Every download is recorded in the audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a href="/api/export?type=deidentified&dataset=patients"><Button variant="outline">De-identified patients</Button></a>
          <a href="/api/export?type=deidentified&dataset=surgeries"><Button variant="outline">De-identified surgeries</Button></a>
          {canFull && <a href="/api/export?type=full&dataset=patients"><Button variant="danger">Full identifiable patients (admin)</Button></a>}
          {canFull && <a href="/api/export?type=full&dataset=surgeries"><Button variant="danger">Full identifiable surgeries (admin)</Button></a>}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Research Projects</p>
            <p className="text-2xl font-bold">{data.projectCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Publications</p>
            <p className="text-2xl font-bold">{data.publicationCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Data Extracts</p>
            <p className="text-2xl font-bold">{data.dataExtracts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Active Studies</p>
            <p className="text-2xl font-bold text-emerald-600">
              {data.projects.filter((p) => p.status === "active").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Research Projects */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Research Projects</CardTitle>
              <Link href="/research/projects">
                <Button size="sm" variant="ghost">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.projects.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No research projects yet.{" "}
                <Link href="/research/projects/new" className="text-emerald-600 hover:underline">
                  Create one
                </Link>
              </p>
            ) : (
              <div className="space-y-4">
                {data.projects.slice(0, 5).map((project) => (
                  <div key={project.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 line-clamp-1">{project.title}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          PI: {project.principalInvestigator}
                        </p>
                      </div>
                      <Badge variant={statusColors[project.status || "proposed"]}>
                        {project.status?.replace("_", " ")}
                      </Badge>
                    </div>
                    {project.ethicsApprovalNumber && (
                      <p className="text-xs text-gray-400 mt-2">
                        Ethics: {project.ethicsApprovalNumber}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Publications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Publications</CardTitle>
              <Link href="/research/publications">
                <Button size="sm" variant="ghost">View All</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.publications.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No publications recorded yet.
              </p>
            ) : (
              <div className="space-y-4">
                {data.publications.map((pub) => (
                  <div key={pub.id} className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900 line-clamp-2">{pub.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{pub.authors}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">
                        {pub.journal} • {formatDate(pub.publicationDate)}
                      </span>
                      {pub.doi && (
                        <a
                          href={`https://doi.org/${pub.doi}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          DOI
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Extracts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Data Extract Requests</CardTitle>
              <CardDescription>Requests for de-identified registry data</CardDescription>
            </div>
            <Link href="/research/extract/new">
              <Button size="sm" variant="outline">New Request</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {data.dataExtracts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No data extract requests.{" "}
              <Link href="/research/extract/new" className="text-emerald-600 hover:underline">
                Request data
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request Date</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dataExtracts.map((extract) => (
                  <TableRow key={extract.id}>
                    <TableCell>{formatDate(extract.requestDate)}</TableCell>
                    <TableCell className="max-w-xs truncate">{extract.purpose}</TableCell>
                    <TableCell>{extract.recordsRequested || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          extract.approvalStatus === "approved"
                            ? "success"
                            : extract.approvalStatus === "rejected"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {extract.approvalStatus || "pending"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Research Guidelines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <span className="text-2xl">📋</span>
              <h3 className="font-medium mt-2">Ethics Requirements</h3>
              <p className="text-sm text-gray-500 mt-1">
                All research using NCR data requires CHRPE/KATH-IRB approval
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <span className="text-2xl">🔒</span>
              <h3 className="font-medium mt-2">Data Protection</h3>
              <p className="text-sm text-gray-500 mt-1">
                All extracts are de-identified per Ghana Data Protection Act
              </p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <span className="text-2xl">📝</span>
              <h3 className="font-medium mt-2">Acknowledgment</h3>
              <p className="text-sm text-gray-500 mt-1">
                Publications must acknowledge the National Cleft Registry
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

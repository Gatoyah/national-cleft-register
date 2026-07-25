import { db, patients, diagnoses, surgeries } from "@/db";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, getRegionLabel, getCleftTypeLabel, getSurgeryTypeLabel, calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPatient(id: number) {
  const [patient] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return patient;
}

async function getPatientData(patientId: number) {
  const [diagnosisList, surgeryList] = await Promise.all([
    db.select().from(diagnoses).where(eq(diagnoses.patientId, patientId)).orderBy(desc(diagnoses.diagnosisDate)),
    db.select().from(surgeries).where(eq(surgeries.patientId, patientId)).orderBy(desc(surgeries.surgeryDate)),
  ]);

  return { diagnoses: diagnosisList, surgeries: surgeryList };
}

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const patientId = parseInt(id, 10);
  
  if (isNaN(patientId)) notFound();

  const patient = await getPatient(patientId);
  if (!patient) notFound();

  const data = await getPatientData(patientId);
  const primaryDiagnosis = data.diagnoses[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-emerald-600">
              {patient.firstName[0]}{patient.lastName[0]}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {patient.firstName} {patient.middleName || ""} {patient.lastName}
            </h1>
            <p className="text-gray-500 mt-1">
              ID: <span className="font-mono">{patient.ncrId || patient.localId.slice(0, 8)}</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={patient.syncStatus === "synced" ? "success" : patient.syncStatus === "failed" ? "danger" : "warning"}>
                {patient.syncStatus}
              </Badge>
              {patient.isDeceased && <Badge variant="danger">Deceased</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/surgeries/new?patientId=${patient.id}`}>
            <Button>Record Surgery</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Demographics */}
          <Card>
            <CardHeader>
              <CardTitle>Patient Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Sex</p>
                  <p className="font-medium capitalize">{patient.sex}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date of Birth</p>
                  <p className="font-medium">{formatDate(patient.dateOfBirth)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Age</p>
                  <p className="font-medium">{calculateAge(patient.dateOfBirth)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Place of Birth</p>
                  <p className="font-medium">{patient.placeOfBirth || "Not recorded"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Diagnosis */}
          <Card>
            <CardHeader>
              <CardTitle>Cleft Diagnosis</CardTitle>
            </CardHeader>
            <CardContent>
              {primaryDiagnosis ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Cleft Type</p>
                    <p className="font-medium">{getCleftTypeLabel(primaryDiagnosis.cleftType)}</p>
                  </div>
                  {primaryDiagnosis.lipLaterality && (
                    <div>
                      <p className="text-sm text-gray-500">Lip Laterality</p>
                      <p className="font-medium capitalize">{primaryDiagnosis.lipLaterality.replace(/_/g, " ")}</p>
                    </div>
                  )}
                  {primaryDiagnosis.lahsalCode && (
                    <div>
                      <p className="text-sm text-gray-500">LAHSAL Code</p>
                      <p className="font-mono font-medium">{primaryDiagnosis.lahsalCode}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Diagnosis Date</p>
                    <p className="font-medium">{formatDate(primaryDiagnosis.diagnosisDate)}</p>
                  </div>
                  {primaryDiagnosis.hasAssociatedAnomalies && (
                    <div className="col-span-full">
                      <p className="text-sm text-gray-500">Associated Anomalies</p>
                      <p className="font-medium">{primaryDiagnosis.associatedAnomaliesDetails || "Yes"}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">No diagnosis recorded</p>
              )}
            </CardContent>
          </Card>

          {/* Surgeries */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Surgical History</CardTitle>
                <Link href={`/surgeries/new?patientId=${patient.id}`}>
                  <Button size="sm" variant="outline">Add Surgery</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {data.surgeries.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No surgeries recorded</p>
                  <Link href={`/surgeries/new?patientId=${patient.id}`} className="text-emerald-600 hover:underline text-sm">
                    Record first surgery
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.surgeries.map((surgery) => (
                    <div key={surgery.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{getSurgeryTypeLabel(surgery.surgeryType)}</p>
                          <p className="text-sm text-gray-500">{formatDate(surgery.surgeryDate)}</p>
                          {surgery.surgeonName && (
                            <p className="text-sm text-gray-500">Surgeon: {surgery.surgeonName}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {surgery.isPrimarySurgery && <Badge variant="info">Primary</Badge>}
                          {surgery.complications && <Badge variant="danger">Complications</Badge>}
                          <Badge variant={surgery.syncStatus === "synced" ? "success" : "warning"}>
                            {surgery.syncStatus}
                          </Badge>
                        </div>
                      </div>
                      {surgery.dischargeCondition && (
                        <p className="text-sm mt-2">
                          Discharge: {surgery.dischargeCondition}
                          {surgery.dischargeDate && ` (${formatDate(surgery.dischargeDate)})`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle>Residence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Region</p>
                <p className="font-medium">{getRegionLabel(patient.regionOfResidence)}</p>
              </div>
              {patient.districtOfResidence && (
                <div>
                  <p className="text-sm text-gray-500">District</p>
                  <p className="font-medium">{patient.districtOfResidence}</p>
                </div>
              )}
              {patient.townVillage && (
                <div>
                  <p className="text-sm text-gray-500">Town/Village</p>
                  <p className="font-medium">{patient.townVillage}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Caregiver */}
          <Card>
            <CardHeader>
              <CardTitle>Caregiver</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{patient.caregiverName}</p>
                {patient.caregiverRelationship && (
                  <p className="text-sm text-gray-400 capitalize">{patient.caregiverRelationship}</p>
                )}
              </div>
              {patient.caregiverPhone && (
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <a href={`tel:${patient.caregiverPhone}`} className="font-medium text-emerald-600">
                    {patient.caregiverPhone}
                  </a>
                  {patient.caregiverPhone2 && (
                    <p className="text-sm">
                      Alt: <a href={`tel:${patient.caregiverPhone2}`} className="text-emerald-600">{patient.caregiverPhone2}</a>
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Record Info */}
          <Card>
            <CardHeader>
              <CardTitle>Record Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span>{formatDate(patient.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Updated</span>
                <span>{formatDate(patient.updatedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Local ID</span>
                <span className="font-mono text-xs">{patient.localId.slice(0, 12)}...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

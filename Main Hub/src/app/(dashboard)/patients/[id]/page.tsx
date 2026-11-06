import { requirePagePermission } from "@/lib/auth";
import { db, patients, birthHistory, diagnoses, nutritionAssessments, surgeries, speechAssessments, appointments, outcomes } from "@/db";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, getRegionLabel, getCleftTypeLabel, getLateralityLabel, getSurgeryTypeLabel, calculateAge } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPatient(id: number) {
  const [patient] = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return patient;
}

async function getPatientData(patientId: number) {
  const [birth, diagnosisList, nutritionList, surgeryList, speechList, appointmentList, outcomeList] = await Promise.all([
    db.select().from(birthHistory).where(eq(birthHistory.patientId, patientId)).limit(1),
    db.select().from(diagnoses).where(eq(diagnoses.patientId, patientId)).orderBy(desc(diagnoses.diagnosisDate)),
    db.select().from(nutritionAssessments).where(eq(nutritionAssessments.patientId, patientId)).orderBy(desc(nutritionAssessments.assessmentDate)).limit(5),
    db.select().from(surgeries).where(eq(surgeries.patientId, patientId)).orderBy(desc(surgeries.surgeryDate)),
    db.select().from(speechAssessments).where(eq(speechAssessments.patientId, patientId)).orderBy(desc(speechAssessments.assessmentDate)).limit(3),
    db.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.scheduledDate)).limit(5),
    db.select().from(outcomes).where(eq(outcomes.patientId, patientId)).orderBy(desc(outcomes.assessmentDate)).limit(3),
  ]);

  return {
    birthHistory: birth[0] || null,
    diagnoses: diagnosisList,
    nutritionAssessments: nutritionList,
    surgeries: surgeryList,
    speechAssessments: speechList,
    appointments: appointmentList,
    outcomes: outcomeList,
  };
}

export default async function PatientDetailPage({ params }: PageProps) {
  await requirePagePermission("patients.view");
  const { id } = await params;
  const patientId = parseInt(id, 10);
  
  if (isNaN(patientId)) {
    notFound();
  }

  const patient = await getPatient(patientId);
  
  if (!patient) {
    notFound();
  }

  const data = await getPatientData(patientId);
  const primaryDiagnosis = data.diagnoses.find((d) => d.isPrimaryDiagnosis);

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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {patient.firstName} {patient.middleName ? `${patient.middleName} ` : ""}{patient.lastName}
              </h1>
              {patient.isDeceased ? (
                <Badge variant="danger">Deceased</Badge>
              ) : patient.isLostToFollowUp ? (
                <Badge variant="warning">Lost to Follow-up</Badge>
              ) : (
                <Badge variant="success">Active</Badge>
              )}
            </div>
            <p className="text-gray-500 mt-1">
              NCR ID: <span className="font-medium text-gray-900">{patient.ncrId}</span>
              {patient.nhisNumber && (
                <> • NHIS: <span className="font-medium text-gray-900">{patient.nhisNumber}</span></>
              )}
            </p>
            <p className="text-gray-500">
              {calculateAge(patient.dateOfBirth)} old • {patient.sex} • {getRegionLabel(patient.regionOfResidence)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/patients/${patient.id}/edit`}>
            <Button variant="outline">Edit Patient</Button>
          </Link>
          <Link href={`/patients/${patient.id}/diagnosis/new`}>
            <Button variant="outline">Add Diagnosis</Button>
          </Link>
          <Link href={`/patients/${patient.id}/surgery/new`}>
            <Button>Record Surgery</Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Surgeries</p>
            <p className="text-2xl font-bold text-gray-900">{data.surgeries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Appointments</p>
            <p className="text-2xl font-bold text-gray-900">{data.appointments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Assessments</p>
            <p className="text-2xl font-bold text-gray-900">
              {data.nutritionAssessments.length + data.speechAssessments.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Date of Birth</p>
            <p className="text-xl font-bold text-gray-900">{formatDate(patient.dateOfBirth)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Diagnosis */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Diagnosis & Classification</CardTitle>
                <Link href={`/patients/${patient.id}/diagnosis/new`}>
                  <Button size="sm" variant="outline">Add Diagnosis</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {primaryDiagnosis ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Cleft Type</p>
                      <p className="font-medium">{getCleftTypeLabel(primaryDiagnosis.cleftType)}</p>
                    </div>
                    {primaryDiagnosis.lipLaterality && (
                      <div>
                        <p className="text-sm text-gray-500">Lip Laterality</p>
                        <p className="font-medium">{getLateralityLabel(primaryDiagnosis.lipLaterality)}</p>
                      </div>
                    )}
                    {primaryDiagnosis.lahsalCode && (
                      <div>
                        <p className="text-sm text-gray-500">LAHSAL Code</p>
                        <p className="font-medium font-mono">{primaryDiagnosis.lahsalCode}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500">Diagnosis Date</p>
                      <p className="font-medium">{formatDate(primaryDiagnosis.diagnosisDate)}</p>
                    </div>
                  </div>
                  {primaryDiagnosis.hasAssociatedAnomalies && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-medium text-amber-800">Associated Anomalies</p>
                      <p className="text-sm text-amber-700">
                        {primaryDiagnosis.pierreRobinSequence && "Pierre Robin Sequence • "}
                        {primaryDiagnosis.deletion22q11 && "22q11.2 Deletion • "}
                        {primaryDiagnosis.otherSyndrome}
                        {primaryDiagnosis.associatedAnomaliesDetails}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  No diagnosis recorded.{" "}
                  <Link href={`/patients/${patient.id}/diagnosis/new`} className="text-emerald-600 hover:underline">
                    Add diagnosis
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Surgeries */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Surgical History</CardTitle>
                <Link href={`/patients/${patient.id}/surgery/new`}>
                  <Button size="sm" variant="outline">Record Surgery</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {data.surgeries.length > 0 ? (
                <div className="space-y-4">
                  {data.surgeries.map((surgery) => (
                    <div
                      key={surgery.id}
                      className="flex items-start justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{getSurgeryTypeLabel(surgery.surgeryType)}</p>
                          {surgery.isPrimarySurgery && <Badge variant="info">Primary</Badge>}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {formatDate(surgery.surgeryDate)}
                          {surgery.lipTechnique && ` • ${surgery.lipTechnique} technique`}
                          {surgery.palateTechnique && ` • ${surgery.palateTechnique} technique`}
                        </p>
                        {surgery.procedureDescription && (
                          <p className="text-sm text-gray-600 mt-2">{surgery.procedureDescription}</p>
                        )}
                      </div>
                      <Link href={`/surgeries/${surgery.id}`}>
                        <Button size="sm" variant="ghost">View Details</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  No surgeries recorded.{" "}
                  <Link href={`/patients/${patient.id}/surgery/new`} className="text-emerald-600 hover:underline">
                    Record surgery
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Comprehensive Care */}
          <Card>
            <CardHeader>
              <CardTitle>Comprehensive Care</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link
                  href={`/patients/${patient.id}/speech`}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center"
                >
                  <span className="text-2xl">🗣️</span>
                  <p className="font-medium mt-2">Speech</p>
                  <p className="text-sm text-gray-500">{data.speechAssessments.length} assessments</p>
                </Link>
                <Link
                  href={`/patients/${patient.id}/nutrition`}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center"
                >
                  <span className="text-2xl">🍎</span>
                  <p className="font-medium mt-2">Nutrition</p>
                  <p className="text-sm text-gray-500">{data.nutritionAssessments.length} records</p>
                </Link>
                <Link
                  href={`/patients/${patient.id}/dental`}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center"
                >
                  <span className="text-2xl">🦷</span>
                  <p className="font-medium mt-2">Dental</p>
                  <p className="text-sm text-gray-500">View records</p>
                </Link>
                <Link
                  href={`/patients/${patient.id}/ent`}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center"
                >
                  <span className="text-2xl">👂</span>
                  <p className="font-medium mt-2">ENT</p>
                  <p className="text-sm text-gray-500">View records</p>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Caregiver</p>
                <p className="font-medium">{patient.caregiverName}</p>
                {patient.caregiverRelationship && (
                  <p className="text-sm text-gray-500 capitalize">{patient.caregiverRelationship}</p>
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
                      Alt:{" "}
                      <a href={`tel:${patient.caregiverPhone2}`} className="text-emerald-600">
                        {patient.caregiverPhone2}
                      </a>
                    </p>
                  )}
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Address</p>
                <p className="font-medium">
                  {patient.townVillage && `${patient.townVillage}, `}
                  {patient.districtOfResidence && `${patient.districtOfResidence}, `}
                  {getRegionLabel(patient.regionOfResidence)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Appointments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Appointments</CardTitle>
                <Link href={`/patients/${patient.id}/appointments/new`}>
                  <Button size="sm" variant="ghost">+ Add</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {data.appointments.length > 0 ? (
                <div className="space-y-3">
                  {data.appointments.slice(0, 3).map((apt) => (
                    <div key={apt.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{apt.appointmentType || apt.visitType}</p>
                        <p className="text-xs text-gray-500">{formatDate(apt.scheduledDate)}</p>
                      </div>
                      <Badge
                        variant={
                          apt.status === "completed"
                            ? "success"
                            : apt.status === "missed"
                            ? "danger"
                            : apt.status === "scheduled"
                            ? "info"
                            : "default"
                        }
                      >
                        {apt.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-2">No appointments</p>
              )}
            </CardContent>
          </Card>

          {/* Consent Status */}
          <Card>
            <CardHeader>
              <CardTitle>Consent Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Clinical Care</span>
                {patient.consentClinicalCare ? (
                  <Badge variant="success">✓</Badge>
                ) : (
                  <Badge variant="danger">✗</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Photography</span>
                {patient.consentPhotography ? (
                  <Badge variant="success">✓</Badge>
                ) : (
                  <Badge variant="danger">✗</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Research</span>
                {patient.consentResearch ? (
                  <Badge variant="success">✓</Badge>
                ) : (
                  <Badge variant="danger">✗</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Data Sharing</span>
                {patient.consentDataSharing ? (
                  <Badge variant="success">✓</Badge>
                ) : (
                  <Badge variant="danger">✗</Badge>
                )}
              </div>
              {patient.consentDate && (
                <p className="text-xs text-gray-500 pt-2">
                  Consented on {formatDate(patient.consentDate)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Latest Nutrition */}
          {data.nutritionAssessments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Nutrition</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const latest = data.nutritionAssessments[0];
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Weight</span>
                        <span className="font-medium">{latest.weightKg ? `${latest.weightKg} kg` : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Height</span>
                        <span className="font-medium">{latest.heightCm ? `${latest.heightCm} cm` : "—"}</span>
                      </div>
                      {latest.weightForAgeZ && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">WAZ</span>
                          <span className="font-medium">{latest.weightForAgeZ}</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 pt-2">
                        Assessed on {formatDate(latest.assessmentDate)}
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

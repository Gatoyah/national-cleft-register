"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useCsrf } from "@/hooks/useCsrf";

const surgeryTypes = [
  { value: "primary_lip_repair", label: "Primary Lip Repair" },
  { value: "primary_palate_repair", label: "Primary Palate Repair" },
  { value: "secondary_lip_revision", label: "Secondary Lip Revision" },
  { value: "alveolar_bone_graft", label: "Alveolar Bone Graft" },
  { value: "pharyngoplasty", label: "Pharyngoplasty" },
  { value: "fistula_repair", label: "Fistula Repair" },
  { value: "rhinoplasty", label: "Rhinoplasty" },
  { value: "other", label: "Other" },
];

const lipTechniques = [
  { value: "millard", label: "Millard" },
  { value: "tennison_randall", label: "Tennison-Randall" },
  { value: "fisher", label: "Fisher" },
  { value: "mohler", label: "Mohler" },
  { value: "other", label: "Other" },
];

const palateTechniques = [
  { value: "bardach", label: "Bardach (Two-Flap)" },
  { value: "furlow", label: "Furlow" },
  { value: "von_langenbeck", label: "von Langenbeck" },
  { value: "veau_wardill_kilner", label: "Veau-Wardill-Kilner" },
  { value: "intravelar_veloplasty", label: "Intravelar Veloplasty" },
  { value: "other", label: "Other" },
];

const asaClassifications = [
  { value: "I", label: "ASA I - Healthy" },
  { value: "II", label: "ASA II - Mild systemic disease" },
  { value: "III", label: "ASA III - Severe systemic disease" },
  { value: "IV", label: "ASA IV - Life-threatening disease" },
  { value: "V", label: "ASA V - Moribund" },
];

export default function NewSurgeryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [patientId, setPatientId] = useState(patientIdParam || "");
  const [patientInfo, setPatientInfo] = useState<{ ncrId: string; firstName: string; lastName: string } | null>(null);
  const { getCsrfHeaders } = useCsrf();

  useEffect(() => {
    if (patientId) {
      fetch(`/api/patients/${patientId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ncrId) {
            setPatientInfo(data);
          }
        })
        .catch(() => setPatientInfo(null));
    }
  }, [patientId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    if (!patientId) {
      setError("Please select a patient");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/patients/${patientId}/surgeries`, {
        method: "POST",
        headers: getCsrfHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to record surgery");
      }

      const surgery = await res.json();
      router.push(`/patients/${patientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Record Surgery</h1>
        <p className="text-gray-500 mt-1">Document surgical procedure and outcomes</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Patient</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Input
                  label="Patient ID"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="Enter patient ID"
                  required
                />
              </div>
              {patientInfo && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <p className="text-sm font-medium text-emerald-800">
                    {patientInfo.firstName} {patientInfo.lastName}
                  </p>
                  <p className="text-xs text-emerald-600">{patientInfo.ncrId}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pre-operative Assessment */}
        <Card>
          <CardHeader>
            <CardTitle>Pre-operative Assessment</CardTitle>
            <CardDescription>WHO Surgical Safety Checklist compliance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Pre-op Date" name="preOpDate" type="date" />
              <Input label="Haemoglobin (g/dL)" name="preOpHaemoglobin" type="number" step="0.1" />
              <Input label="Blood Group" name="bloodGroup" placeholder="e.g., A+" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="ASA Classification"
                name="asaClassification"
                options={asaClassifications}
                placeholder="Select ASA class"
              />
              <Input label="Pre-op Weight (kg)" name="preOpWeight" type="number" step="0.1" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="anaesthesiaReviewCompleted"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-sm">Anaesthesia review completed</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="safetyChecklistCompleted"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-sm">Safety checklist completed</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="fitForSurgery"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                  defaultChecked
                />
                <span className="text-sm">Fit for surgery</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Surgery Details */}
        <Card>
          <CardHeader>
            <CardTitle>Surgery Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Surgery Date" name="surgeryDate" type="date" required />
              <Select
                label="Surgery Type"
                name="surgeryType"
                options={surgeryTypes}
                required
                placeholder="Select surgery type"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Lip Technique"
                name="lipTechnique"
                options={lipTechniques}
                placeholder="Select if applicable"
              />
              <Select
                label="Palate Technique"
                name="palateTechnique"
                options={palateTechniques}
                placeholder="Select if applicable"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Duration (minutes)" name="durationMinutes" type="number" />
              <Input label="Anaesthesia Type" name="anaesthesiaType" placeholder="e.g., General" />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isPrimarySurgery"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                  defaultChecked
                />
                <span className="text-sm">Primary surgery</span>
              </label>
            </div>
            <Textarea
              label="Procedure Description"
              name="procedureDescription"
              rows={3}
              placeholder="Describe the procedure performed..."
            />
          </CardContent>
        </Card>

        {/* Intraoperative */}
        <Card>
          <CardHeader>
            <CardTitle>Intraoperative Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Blood Loss (mL)" name="bloodLossMl" type="number" />
              <div>
                <label className="flex items-center gap-2 mt-8">
                  <input
                    type="checkbox"
                    name="bloodTransfusion"
                    value="true"
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="text-sm">Blood transfusion given</span>
                </label>
              </div>
              <Input label="Transfusion Volume (mL)" name="transfusionVolumeMl" type="number" />
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="intraopComplications"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-sm">Intraoperative complications</span>
              </label>
            </div>
            <Textarea
              label="Complications Details"
              name="intraopComplicationsDetails"
              rows={2}
              placeholder="Describe any complications..."
            />
          </CardContent>
        </Card>

        {/* Post-operative */}
        <Card>
          <CardHeader>
            <CardTitle>Post-operative Care</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="icuAdmission"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-sm">ICU admission required</span>
              </label>
              <Input
                label="ICU Days"
                name="icuDays"
                type="number"
                className="w-24"
              />
            </div>
            <Textarea
              label="Post-op Notes"
              name="postOpNotes"
              rows={3}
              placeholder="Post-operative observations and care notes..."
            />
          </CardContent>
        </Card>

        {/* Discharge */}
        <Card>
          <CardHeader>
            <CardTitle>Discharge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Discharge Date" name="dischargeDate" type="date" />
              <Input label="Length of Stay (days)" name="lengthOfStayDays" type="number" />
              <Input label="Discharge Condition" name="dischargeCondition" placeholder="e.g., Good, Stable" />
            </div>
            <Textarea
              label="Discharge Instructions"
              name="dischargeInstructions"
              rows={3}
              placeholder="Instructions given to caregiver..."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Record Surgery
          </Button>
        </div>
      </form>
    </div>
  );
}

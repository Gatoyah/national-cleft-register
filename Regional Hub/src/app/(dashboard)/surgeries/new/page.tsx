"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

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

export default function NewSurgeryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [patientId, setPatientId] = useState(patientIdParam || "");
  const [patientInfo, setPatientInfo] = useState<{ firstName: string; lastName: string } | null>(null);

  useEffect(() => {
    if (patientId) {
      fetch(`/api/patients/${patientId}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => data && setPatientInfo(data))
        .catch(() => setPatientInfo(null));
    }
  }, [patientId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/surgeries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, patientId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to record surgery");
      }

      router.push(`/patients/${patientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Record Surgery</h1>
        <p className="text-gray-500 mt-1">Document surgical procedure details</p>
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
                  <p className="font-medium text-emerald-800">
                    {patientInfo.firstName} {patientInfo.lastName}
                  </p>
                </div>
              )}
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
                placeholder="Select type"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Surgeon Name" name="surgeonName" placeholder="Enter surgeon name" />
              <Input label="Duration (minutes)" name="durationMinutes" type="number" />
            </div>
            <div className="flex items-center gap-4">
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
              placeholder="Describe the procedure..."
            />
          </CardContent>
        </Card>

        {/* Complications */}
        <Card>
          <CardHeader>
            <CardTitle>Complications & Outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="complications"
                value="true"
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <span className="text-sm">Complications occurred</span>
            </label>
            <Textarea
              label="Complications Details"
              name="complicationsDetails"
              rows={2}
              placeholder="Describe any complications..."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Discharge Date" name="dischargeDate" type="date" />
              <Input label="Discharge Condition" name="dischargeCondition" placeholder="e.g., Good, Stable" />
            </div>
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

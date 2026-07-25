"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

const cleftTypes = [
  { value: "cleft_lip_only", label: "Cleft Lip Only" },
  { value: "cleft_palate_only", label: "Cleft Palate Only" },
  { value: "cleft_lip_and_palate", label: "Cleft Lip and Palate" },
];

const lateralityOptions = [
  { value: "unilateral_left", label: "Unilateral Left" },
  { value: "unilateral_right", label: "Unilateral Right" },
  { value: "bilateral", label: "Bilateral" },
  { value: "midline", label: "Midline" },
];

const palateTypes = [
  { value: "soft", label: "Soft Palate Only" },
  { value: "hard", label: "Hard Palate Only" },
  { value: "soft_and_hard", label: "Soft and Hard Palate" },
  { value: "submucous", label: "Submucous Cleft" },
];

const veauClasses = [
  { value: "I", label: "Veau Class I - Soft palate only" },
  { value: "II", label: "Veau Class II - Soft and hard palate" },
  { value: "III", label: "Veau Class III - Complete unilateral" },
  { value: "IV", label: "Veau Class IV - Complete bilateral" },
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NewDiagnosisPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cleftType, setCleftType] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch(`/api/patients/${id}/diagnoses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add diagnosis");
      }

      router.push(`/patients/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  const showLipFields = cleftType === "cleft_lip_only" || cleftType === "cleft_lip_and_palate";
  const showPalateFields = cleftType === "cleft_palate_only" || cleftType === "cleft_lip_and_palate";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Add Diagnosis</h1>
        <p className="text-gray-500 mt-1">Record cleft classification using LAHSAL code system</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Diagnosis Timing */}
        <Card>
          <CardHeader>
            <CardTitle>Diagnosis Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Diagnosis Date"
                name="diagnosisDate"
                type="date"
                required
                defaultValue={new Date().toISOString().split("T")[0]}
              />
              <div className="flex gap-6 items-end pb-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="diagnosedAntenatally"
                    value="true"
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="text-sm">Diagnosed antenatally</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="diagnosedAtBirth"
                    value="true"
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span className="text-sm">Diagnosed at birth</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cleft Classification */}
        <Card>
          <CardHeader>
            <CardTitle>Cleft Classification</CardTitle>
            <CardDescription>Use LAHSAL notation for detailed classification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              label="Cleft Type"
              name="cleftType"
              options={cleftTypes}
              required
              placeholder="Select cleft type"
              value={cleftType}
              onChange={(e) => setCleftType(e.target.value)}
            />

            {/* Lip Details */}
            {showLipFields && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-4">
                <h4 className="font-medium text-blue-900">Lip Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select
                    label="Lip Laterality"
                    name="lipLaterality"
                    options={lateralityOptions}
                    placeholder="Select laterality"
                  />
                  <div className="flex items-end gap-4 pb-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="lipInvolved"
                        value="true"
                        className="w-4 h-4 text-emerald-600 rounded"
                        defaultChecked={showLipFields}
                      />
                      <span className="text-sm">Lip involved</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="lipComplete"
                        value="true"
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span className="text-sm">Complete cleft</span>
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="alveolarInvolved"
                        value="true"
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span className="text-sm">Alveolus involved</span>
                    </label>
                  </div>
                  <Select
                    label="Alveolar Laterality"
                    name="alveolarLaterality"
                    options={lateralityOptions}
                    placeholder="Select if applicable"
                  />
                </div>
              </div>
            )}

            {/* Palate Details */}
            {showPalateFields && (
              <div className="p-4 bg-purple-50 rounded-lg space-y-4">
                <h4 className="font-medium text-purple-900">Palate Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Select
                    label="Palate Type"
                    name="palateType"
                    options={palateTypes}
                    placeholder="Select palate involvement"
                  />
                  <Select
                    label="Veau Classification"
                    name="veauClass"
                    options={veauClasses}
                    placeholder="Select Veau class"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="palateInvolved"
                    value="true"
                    className="w-4 h-4 text-emerald-600 rounded"
                    defaultChecked={showPalateFields}
                  />
                  <span className="text-sm">Palate involved</span>
                </div>
              </div>
            )}

            {/* LAHSAL Code */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <Input
                label="LAHSAL Code"
                name="lahsalCode"
                placeholder="e.g., LAHSAL (capital = complete, lowercase = incomplete)"
                hint="L=Lip, A=Alveolus, H=Hard palate, S=Soft palate, A=Alveolus, L=Lip (right to left as facing patient)"
              />
            </div>

            {/* ICD Codes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="ICD-10 Code"
                name="icd10Code"
                placeholder="e.g., Q35-Q37"
              />
              <Input
                label="ICD-11 Code"
                name="icd11Code"
                placeholder="Optional"
              />
            </div>
          </CardContent>
        </Card>

        {/* Associated Conditions */}
        <Card>
          <CardHeader>
            <CardTitle>Associated Conditions</CardTitle>
            <CardDescription>Document any syndromes or anomalies</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="hasAssociatedAnomalies"
                value="true"
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <span className="text-sm">Has associated anomalies</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  name="pierreRobinSequence"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-sm">Pierre Robin Sequence</span>
              </label>
              <label className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  name="deletion22q11"
                  value="true"
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-sm">22q11.2 Deletion (DiGeorge)</span>
              </label>
            </div>

            <Input
              label="Other Syndrome"
              name="otherSyndrome"
              placeholder="e.g., Van der Woude, Stickler, etc."
            />

            <Textarea
              label="Additional Details"
              name="associatedAnomaliesDetails"
              rows={3}
              placeholder="Describe any other congenital anomalies or relevant findings..."
            />
          </CardContent>
        </Card>

        {/* Primary Diagnosis Flag */}
        <Card>
          <CardContent>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isPrimaryDiagnosis"
                value="true"
                className="w-4 h-4 text-emerald-600 rounded"
                defaultChecked
              />
              <span className="text-sm font-medium">Mark as primary diagnosis</span>
            </label>
            <p className="text-sm text-gray-500 mt-1">
              The primary diagnosis is used for statistics and reporting
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Save Diagnosis
          </Button>
        </div>
      </form>
    </div>
  );
}

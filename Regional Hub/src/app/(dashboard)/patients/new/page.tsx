"use client";

import { useCsrf } from "@/hooks/useCsrf";
import { describeApiError } from "@/components/AuthShell";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const regions = [
  { value: "ashanti", label: "Ashanti" },
  { value: "greater_accra", label: "Greater Accra" },
  { value: "northern", label: "Northern" },
  { value: "western", label: "Western" },
  { value: "eastern", label: "Eastern" },
  { value: "central", label: "Central" },
  { value: "volta", label: "Volta" },
  { value: "upper_east", label: "Upper East" },
  { value: "upper_west", label: "Upper West" },
  { value: "bono", label: "Bono" },
  { value: "bono_east", label: "Bono East" },
  { value: "ahafo", label: "Ahafo" },
  { value: "western_north", label: "Western North" },
  { value: "oti", label: "Oti" },
  { value: "north_east", label: "North East" },
  { value: "savannah", label: "Savannah" },
];

const sexOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "intersex", label: "Intersex" },
];

const cleftTypes = [
  { value: "cleft_lip_only", label: "Cleft Lip Only" },
  { value: "cleft_palate_only", label: "Cleft Palate Only" },
  { value: "cleft_lip_and_palate", label: "Cleft Lip and Palate" },
];

const lateralityOptions = [
  { value: "", label: "Not applicable" },
  { value: "unilateral_left", label: "Unilateral Left" },
  { value: "unilateral_right", label: "Unilateral Right" },
  { value: "bilateral", label: "Bilateral" },
];

const relationshipOptions = [
  { value: "mother", label: "Mother" },
  { value: "father", label: "Father" },
  { value: "grandmother", label: "Grandmother" },
  { value: "grandfather", label: "Grandfather" },
  { value: "aunt", label: "Aunt" },
  { value: "uncle", label: "Uncle" },
  { value: "guardian", label: "Guardian" },
  { value: "other", label: "Other" },
];

export default function NewPatientPage() {
  const { getCsrfHeaders } = useCsrf();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cleftType, setCleftType] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(
      Array.from(formData.entries()).filter(([, value]) => value !== "")
    );

    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: getCsrfHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        const { message, details } = describeApiError(errorData);
        throw new Error(details.length ? `${message}: ${details.join("; ")}` : message || "Failed to register patient");
      }

      const patient = await res.json();
      router.push(`/patients/${patient.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Register Cleft Birth</h1>
        <p className="text-gray-500 mt-1">Enter details of the newborn with cleft condition</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Information */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="First Name" name="firstName" required placeholder="Baby's first name" />
              <Input label="Middle Name" name="middleName" placeholder="Optional" />
              <Input label="Last Name" name="lastName" required placeholder="Family name" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="Date of Birth" name="dateOfBirth" type="date" required />
              <Select label="Sex" name="sex" options={sexOptions} required placeholder="Select" />
              <Input label="Place of Birth" name="placeOfBirth" placeholder="Hospital/facility" />
            </div>
          </CardContent>
        </Card>

        {/* Cleft Diagnosis */}
        <Card>
          <CardHeader>
            <CardTitle>Cleft Diagnosis</CardTitle>
            <CardDescription>Classification of the cleft condition</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Cleft Type"
                name="cleftType"
                options={cleftTypes}
                required
                placeholder="Select type"
                value={cleftType}
                onChange={(e) => setCleftType(e.target.value)}
              />
              {cleftType && cleftType !== "cleft_palate_only" && (
                <Select
                  label="Lip Laterality"
                  name="lipLaterality"
                  options={lateralityOptions}
                  placeholder="Select"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle>Residence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Region"
                name="regionOfResidence"
                options={regions}
                required
                placeholder="Select region"
              />
              <Input label="District" name="districtOfResidence" placeholder="Enter district" />
            </div>
            <Input label="Town / Village" name="townVillage" placeholder="Enter town or village" />
          </CardContent>
        </Card>

        {/* Caregiver */}
        <Card>
          <CardHeader>
            <CardTitle>Caregiver Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Caregiver Name" name="caregiverName" required placeholder="Full name" />
              <Select
                label="Relationship"
                name="caregiverRelationship"
                options={relationshipOptions}
                placeholder="Select"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Phone Number" name="caregiverPhone" type="tel" placeholder="e.g., 0244123456" />
              <Input label="Alternative Phone" name="caregiverPhone2" type="tel" placeholder="Optional" />
            </div>
          </CardContent>
        </Card>

        {/* Consent */}
        <Card>
          <CardHeader>
            <CardTitle>Caregiver Consent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="consentClinicalCare" value="true" className="mt-1 w-4 h-4" />
              <span>Consents to the child&apos;s data being recorded in the National Cleft Registry for clinical care and follow-up.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="consentDataSharing" value="true" className="mt-1 w-4 h-4" />
              <span>Consents to the data being shared with the national Main Hub (KATH) and treating cleft centres.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="consentResearch" value="true" className="mt-1 w-4 h-4" />
              <span>Consents to <strong>de-identified</strong> data (no names or contact details) being used for research. Only consented patients are ever included in research exports.</span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Register Patient
          </Button>
        </div>
      </form>
    </div>
  );
}

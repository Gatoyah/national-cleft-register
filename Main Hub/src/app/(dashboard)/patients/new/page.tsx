"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useCsrf } from "@/hooks/useCsrf";

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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const { getCsrfHeaders } = useCsrf();

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
        throw new Error(errorData.error || "Failed to register patient");
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Register New Patient</h1>
        <p className="text-gray-500 mt-1">Create a new patient record in the National Cleft Registry</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: "Patient Info" },
            { num: 2, label: "Location" },
            { num: 3, label: "Caregiver" },
            { num: 4, label: "Consent" },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                  step >= s.num
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {s.num}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  step >= s.num ? "text-emerald-600" : "text-gray-500"
                }`}
              >
                {s.label}
              </span>
              {i < 3 && (
                <div
                  className={`w-full h-1 mx-4 ${
                    step > s.num ? "bg-emerald-600" : "bg-gray-200"
                  }`}
                  style={{ width: "60px" }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Step 1: Patient Information */}
        <div className={step === 1 ? "" : "hidden"}>
          <Card>
            <CardHeader>
              <CardTitle>Patient Information</CardTitle>
              <CardDescription>Basic demographic information for the patient</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="First Name" name="firstName" required placeholder="Enter first name" />
                <Input label="Middle Name" name="middleName" placeholder="Enter middle name (optional)" />
                <Input label="Last Name" name="lastName" required placeholder="Enter last name" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Date of Birth" name="dateOfBirth" type="date" required />
                <Select label="Sex" name="sex" options={sexOptions} required placeholder="Select sex" />
                <Input label="Place of Birth" name="placeOfBirth" placeholder="Hospital or location" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Ghana Card Number" name="ghanaCardNumber" placeholder="GHA-XXXXXXXXX-X" />
                <Input label="NHIS Number" name="nhisNumber" placeholder="National Health Insurance number" />
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => setStep(2)}>
                  Next: Location →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Location */}
        <div className={step === 2 ? "" : "hidden"}>
          <Card>
            <CardHeader>
              <CardTitle>Location & Residence</CardTitle>
              <CardDescription>Where does the patient live?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Region of Residence"
                  name="regionOfResidence"
                  options={regions}
                  required
                  placeholder="Select region"
                />
                <Input
                  label="District"
                  name="districtOfResidence"
                  placeholder="Enter district name"
                />
              </div>

              <Input
                label="Town / Village"
                name="townVillage"
                placeholder="Enter town or village name"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="GPS Latitude"
                  name="gpsLatitude"
                  type="number"
                  step="any"
                  placeholder="e.g., 6.6885"
                  hint="Optional - for follow-up visits"
                />
                <Input
                  label="GPS Longitude"
                  name="gpsLongitude"
                  type="number"
                  step="any"
                  placeholder="e.g., -1.6244"
                  hint="Optional - for follow-up visits"
                />
              </div>

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Next: Caregiver →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 3: Caregiver */}
        <div className={step === 3 ? "" : "hidden"}>
          <Card>
            <CardHeader>
              <CardTitle>Caregiver Information</CardTitle>
              <CardDescription>Primary caregiver responsible for the patient</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Caregiver Name"
                  name="caregiverName"
                  required
                  placeholder="Full name of caregiver"
                />
                <Select
                  label="Relationship to Patient"
                  name="caregiverRelationship"
                  options={relationshipOptions}
                  placeholder="Select relationship"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Primary Phone"
                  name="caregiverPhone"
                  type="tel"
                  placeholder="e.g., 0244123456"
                />
                <Input
                  label="Secondary Phone"
                  name="caregiverPhone2"
                  type="tel"
                  placeholder="Alternative contact (optional)"
                />
              </div>

              <Input
                label="Occupation"
                name="caregiverOccupation"
                placeholder="Caregiver's occupation"
              />

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <Button type="button" onClick={() => setStep(4)}>
                  Next: Consent →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 4: Consent */}
        <div className={step === 4 ? "" : "hidden"}>
          <Card>
            <CardHeader>
              <CardTitle>Consent & Authorization</CardTitle>
              <CardDescription>Obtain consent for clinical care, photography, and data use</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <label className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="consentClinicalCare"
                    value="true"
                    className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                    defaultChecked
                  />
                  <div>
                    <p className="font-medium text-gray-900">Consent for Clinical Care</p>
                    <p className="text-sm text-gray-500">
                      I consent to receive clinical care and treatment at the National Cleft Care Centre
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="consentPhotography"
                    value="true"
                    className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Consent for Photography</p>
                    <p className="text-sm text-gray-500">
                      I consent to have photographs taken for medical documentation and quality assessment
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="consentResearch"
                    value="true"
                    className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Consent for Research Use</p>
                    <p className="text-sm text-gray-500">
                      I consent to my de-identified data being used for approved research studies
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    name="consentDataSharing"
                    value="true"
                    className="mt-1 w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Consent for Data Sharing</p>
                    <p className="text-sm text-gray-500">
                      I consent to my data being shared with Smile Train for quality improvement purposes
                    </p>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Consent Date"
                  name="consentDate"
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
                <Input
                  label="Witness Name"
                  name="consentWitnessName"
                  placeholder="Name of witness (if any)"
                />
              </div>

              <div className="flex justify-between pt-4">
                <Button type="button" variant="outline" onClick={() => setStep(3)}>
                  ← Back
                </Button>
                <Button type="submit" isLoading={isLoading}>
                  Register Patient
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}

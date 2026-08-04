"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useCsrf } from "@/hooks/useCsrf";

const visitTypes = [
  { value: "scheduled", label: "Scheduled Visit" },
  { value: "unscheduled", label: "Unscheduled Visit" },
  { value: "outreach", label: "Outreach Visit" },
  { value: "telehealth", label: "Telehealth" },
];

const appointmentTypes = [
  { value: "post_op_2_weeks", label: "Post-op (2 weeks)" },
  { value: "post_op_6_weeks", label: "Post-op (6 weeks)" },
  { value: "post_op_3_months", label: "Post-op (3 months)" },
  { value: "post_op_6_months", label: "Post-op (6 months)" },
  { value: "post_op_1_year", label: "Post-op (1 year)" },
  { value: "annual_review", label: "Annual Review" },
  { value: "speech_assessment", label: "Speech Assessment" },
  { value: "speech_therapy", label: "Speech Therapy" },
  { value: "dental", label: "Dental" },
  { value: "orthodontic", label: "Orthodontic" },
  { value: "ent", label: "ENT" },
  { value: "surgical_review", label: "Surgical Review" },
  { value: "pre_op", label: "Pre-operative" },
  { value: "nutrition", label: "Nutrition" },
  { value: "psychosocial", label: "Psychosocial" },
  { value: "other", label: "Other" },
];

const departments = [
  { value: "surgery", label: "Surgery" },
  { value: "speech", label: "Speech Therapy" },
  { value: "dental", label: "Dental" },
  { value: "orthodontics", label: "Orthodontics" },
  { value: "ent", label: "ENT" },
  { value: "nutrition", label: "Nutrition" },
  { value: "psychology", label: "Psychology" },
  { value: "outreach", label: "Outreach" },
];

export default function NewAppointmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get("patientId");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { getCsrfHeaders } = useCsrf();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: getCsrfHeaders(),
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to schedule appointment");
      }

      router.push("/appointments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule Appointment</h1>
        <p className="text-gray-500 mt-1">Create a new appointment for a patient</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Appointment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Patient ID"
              name="patientId"
              type="number"
              required
              defaultValue={patientIdParam || ""}
              placeholder="Enter patient ID"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Date"
                name="scheduledDate"
                type="date"
                required
              />
              <Input
                label="Time"
                name="scheduledTime"
                type="time"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Visit Type"
                name="visitType"
                options={visitTypes}
                required
                placeholder="Select visit type"
              />
              <Select
                label="Appointment Type"
                name="appointmentType"
                options={appointmentTypes}
                placeholder="Select type"
              />
            </div>

            <Select
              label="Department"
              name="department"
              options={departments}
              placeholder="Select department"
            />

            <Textarea
              label="Notes"
              name="notes"
              rows={3}
              placeholder="Additional notes for this appointment..."
            />

            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isLoading}>
                Schedule Appointment
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

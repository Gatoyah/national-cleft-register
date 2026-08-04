"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getRegionLabel } from "@/lib/utils";
import { useCsrf } from "@/hooks/useCsrf";

const facilityTypes = [
  { value: "co_hub", label: "Co-Hub" },
  { value: "regional_centre", label: "Regional Centre" },
];

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

export default function NewHubPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const { getCsrfHeaders } = useCsrf();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name"),
      code: formData.get("code"),
      facilityType: formData.get("facilityType"),
      region: formData.get("region"),
      district: formData.get("district"),
      address: formData.get("address"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      hasInternet: formData.get("hasInternet") === "on",
    };

    try {
      const res = await fetch("/api/hubs/register", {
        method: "POST",
        headers: getCsrfHeaders(),
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register hub");
      }

      setSuccessMessage("Regional hub registered successfully. Redirecting...");
      setTimeout(() => router.push("/hubs"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Register New Regional Hub</h1>
        <p className="text-gray-500 mt-1">Add a new hub or regional centre to the National Cleft Registry network.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Hub Details</CardTitle>
            <CardDescription>Provide the details required to register this facility.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Facility Name" name="name" required placeholder="Korle Bu Teaching Hospital" />
              <Input label="Facility Code" name="code" required placeholder="KBTH" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Facility Type"
                name="facilityType"
                required
                options={facilityTypes}
                placeholder="Select type"
              />
              <Select
                label="Region"
                name="region"
                required
                options={regions}
                placeholder="Select region"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input label="District" name="district" placeholder="Accra Metropolitan" />
              <Input label="Has Internet" name="hasInternet" type="checkbox" />
            </div>

            <Input label="Address" name="address" placeholder="Street address or P.O. Box" />
            <Input label="Phone" name="phone" placeholder="e.g. +233 20 123 4567" />
            <Input label="Email" name="email" type="email" placeholder="hub@example.com" />

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" type="button" onClick={() => router.push("/hubs")}>Cancel</Button>
              <Button type="submit" isLoading={isLoading}>Register Hub</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

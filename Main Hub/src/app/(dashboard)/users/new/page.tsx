"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const roles = [
  { value: "admin", label: "Administrator - Full system access" },
  { value: "surgeon", label: "Surgeon - Can record surgeries and view patients" },
  { value: "clinician", label: "Clinician - Can manage patients and appointments" },
  { value: "data_clerk", label: "Data Clerk - Can enter and edit patient data" },
  { value: "researcher", label: "Researcher - View-only access to de-identified data" },
  { value: "viewer", label: "Viewer - Read-only access" },
  { value: "community_health_worker", label: "CHW - Can register patients at community level" },
];

interface Facility {
  id: number;
  name: string;
  code: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    // Fetch facilities
    fetch("/api/facilities")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFacilities(data);
        }
      })
      .catch(console.error);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create user");
      }

      router.push("/users");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New User</h1>
        <p className="text-gray-500 mt-1">Add a new user to the National Cleft Registry</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                name="firstName"
                required
                placeholder="Enter first name"
              />
              <Input
                label="Last Name"
                name="lastName"
                required
                placeholder="Enter last name"
              />
            </div>

            <Input
              label="Email Address"
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              hint="This will be used for login"
            />

            <Input
              label="Password"
              name="password"
              type="password"
              required
              placeholder="Minimum 8 characters"
              hint="Must be at least 8 characters"
            />

            <Select
              label="Role"
              name="role"
              options={roles}
              required
              placeholder="Select user role"
            />

            <Select
              label="Facility"
              name="facilityId"
              options={[
                { value: "", label: "No specific facility" },
                ...facilities.map((f) => ({
                  value: String(f.id),
                  label: `${f.name} (${f.code})`,
                })),
              ]}
              placeholder="Assign to facility"
            />

            <Input
              label="Phone Number"
              name="phone"
              type="tel"
              placeholder="e.g., 0244123456"
            />

            <Input
              label="Professional ID"
              name="professionalId"
              placeholder="Medical license or staff ID"
            />

            <div className="flex justify-end gap-4 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isLoading}>
                Create User
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Role Permissions Info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">Administrator</p>
              <p className="text-gray-600">Full access to all features including user management, settings, and data export</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">Surgeon</p>
              <p className="text-gray-600">Can record surgeries, view patient records, and access outcome data</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">Clinician</p>
              <p className="text-gray-600">Can manage patients, record assessments, and schedule appointments</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">Data Clerk</p>
              <p className="text-gray-600">Can register patients and enter clinical data</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">Researcher</p>
              <p className="text-gray-600">View-only access to de-identified aggregate data</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

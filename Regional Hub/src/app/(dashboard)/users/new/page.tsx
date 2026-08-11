"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const roles = [
  { value: "admin", label: "Administrator - Full system access" },
  { value: "surgeon", label: "Surgeon - Can record surgeries" },
  { value: "clinician", label: "Clinician - Can manage patients" },
  { value: "data_clerk", label: "Data Clerk - Can enter patient data" },
  { value: "viewer", label: "Viewer - Read-only access" },
];

export default function NewUserPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(
      Array.from(formData.entries()).filter(([, value]) => value !== "")
    );

    if (data.password !== data.confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

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
        <h1 className="text-2xl font-bold text-gray-900">Create User</h1>
        <p className="text-gray-500 mt-1">Add a new user to this regional hub</p>
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
            <CardDescription>User must change password on first login</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" name="firstName" required />
              <Input label="Last Name" name="lastName" required />
            </div>
            <Input label="Email" name="email" type="email" required />
            <Select label="Role" name="role" options={roles} required placeholder="Select role" />
            <Input label="Phone" name="phone" type="tel" />
            <Input label="Professional ID" name="professionalId" placeholder="License number" />
            
            <hr className="my-4" />
            
            <Input 
              label="Password" 
              name="password" 
              type="password" 
              required 
              hint="Minimum 12 characters"
            />
            <Input 
              label="Confirm Password" 
              name="confirmPassword" 
              type="password" 
              required 
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
    </div>
  );
}

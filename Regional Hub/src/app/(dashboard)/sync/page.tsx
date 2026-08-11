"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface SyncStatus {
  facility: {
    code: string;
    name: string;
    region: string;
    mainHubConfigured: boolean;
    syncEnabled: boolean;
    lastSyncAt: string | null;
  } | null;
  stats: {
    pendingQueue: number;
    pendingPatients: number;
    pendingSurgeries: number;
    totalPatients: number;
    totalSurgeries: number;
  };
  timestamp: string;
}

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    fetchStatus();
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/sync/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
    }
  }

  async function handleSync() {
    if (!isOnline) {
      setSyncResult("Cannot sync while offline. Connect to the internet first.");
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch("/api/sync/push", { method: "POST" });
      const data = await res.json();
      
      if (res.ok) {
        const total = (data.results?.patients?.success || 0) + (data.results?.surgeries?.success || 0);
        setSyncResult(`Sync completed. ${total} records uploaded successfully.`);
        fetchStatus();
      } else {
        setSyncResult(`Sync failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      setSyncResult(`Sync error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSyncing(false);
    }
  }

  const hasPendingData = status && (status.stats.pendingQueue > 0 || status.stats.pendingPatients > 0 || status.stats.pendingSurgeries > 0);

  async function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigError(null);
    setConfigSuccess(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      facilityCode: formData.get("facilityCode"),
      facilityName: formData.get("facilityName"),
      mainHubUrl: formData.get("mainHubUrl"),
      apiKey: formData.get("apiKey"),
    };

    try {
      const res = await fetch("/api/sync/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save configuration");
      }

      setConfigSuccess("Sync configuration saved.");
      setIsEditingConfig(false);
      fetchStatus();
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSavingConfig(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Synchronization</h1>
          <p className="text-gray-500 mt-1">Sync local data with the Main Hub (KATH)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isOnline ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className="text-sm font-medium">{isOnline ? "Online" : "Offline"}</span>
          </div>
          <Button onClick={handleSync} isLoading={isSyncing} disabled={!isOnline || !hasPendingData}>
            {isSyncing ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </div>

      {syncResult && (
        <div className={`p-4 rounded-lg ${syncResult.includes("failed") || syncResult.includes("error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {syncResult}
        </div>
      )}

      {/* Facility Info */}
      {status?.facility && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Facility Configuration</CardTitle>
              {!isEditingConfig && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setIsEditingConfig(true);
                    setConfigSuccess(null);
                    setConfigError(null);
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {configSuccess && !isEditingConfig && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                {configSuccess}
              </div>
            )}
            {isEditingConfig ? (
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <p className="text-sm text-gray-500">
                  Enter the facility code and API key issued by the Main Hub when this
                  regional hub was registered (Main Hub &rarr; Regional Hubs &rarr; Register
                  New Regional Hub).
                </p>
                {configError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {configError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Facility Code</label>
                    <input
                      name="facilityCode"
                      required
                      defaultValue={status.facility.code}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                      placeholder="e.g. KATH"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Facility Name</label>
                    <input
                      name="facilityName"
                      defaultValue={status.facility.name}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Main Hub URL</label>
                  <input
                    name="mainHubUrl"
                    required
                    defaultValue="http://localhost:3000"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                    placeholder="http://localhost:3000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input
                    name="apiKey"
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 font-mono text-sm"
                    placeholder="Paste the key issued by the Main Hub"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" type="button" onClick={() => setIsEditingConfig(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={isSavingConfig}>
                    Save Configuration
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Facility</p>
                  <p className="font-medium">{status.facility.name}</p>
                  <p className="text-sm text-gray-400 font-mono">{status.facility.code}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Region</p>
                  <p className="font-medium capitalize">{status.facility.region.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Main Hub</p>
                  {status.facility.mainHubConfigured ? (
                    <Badge variant="success">Configured</Badge>
                  ) : (
                    <Badge variant="danger">Not Configured</Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-500">Last Sync</p>
                  <p className="font-medium">
                    {status.facility.lastSyncAt
                      ? new Date(status.facility.lastSyncAt).toLocaleString()
                      : "Never"
                    }
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sync Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Pending in Queue</p>
            <p className={`text-3xl font-bold ${status?.stats.pendingQueue ? "text-amber-600" : "text-gray-900"}`}>
              {status?.stats.pendingQueue || 0}
            </p>
            <p className="text-sm text-gray-400 mt-1">Records waiting to sync</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Pending Patients</p>
            <p className={`text-3xl font-bold ${status?.stats.pendingPatients ? "text-amber-600" : "text-gray-900"}`}>
              {status?.stats.pendingPatients || 0}
            </p>
            <p className="text-sm text-gray-400 mt-1">Of {status?.stats.totalPatients || 0} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Pending Surgeries</p>
            <p className={`text-3xl font-bold ${status?.stats.pendingSurgeries ? "text-amber-600" : "text-gray-900"}`}>
              {status?.stats.pendingSurgeries || 0}
            </p>
            <p className="text-sm text-gray-400 mt-1">Of {status?.stats.totalSurgeries || 0} total</p>
          </CardContent>
        </Card>
      </div>

      {/* How Sync Works */}
      <Card>
        <CardHeader>
          <CardTitle>How Synchronization Works</CardTitle>
          <CardDescription>Offline-first data entry with automatic sync</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">1</span>
              </div>
              <h3 className="font-medium">Enter Data</h3>
              <p className="text-sm text-gray-500 mt-1">Works offline. Data stored locally.</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">2</span>
              </div>
              <h3 className="font-medium">Queue Created</h3>
              <p className="text-sm text-gray-500 mt-1">Records marked as pending sync.</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">3</span>
              </div>
              <h3 className="font-medium">Sync to Hub</h3>
              <p className="text-sm text-gray-500 mt-1">Click "Sync Now" when online.</p>
            </div>
            <div className="text-center p-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl">4</span>
              </div>
              <h3 className="font-medium">NCR ID Assigned</h3>
              <p className="text-sm text-gray-500 mt-1">Main hub assigns official ID.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Card>
        <CardHeader>
          <CardTitle>Security Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600">All data is encrypted during transmission (TLS 1.3)</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600">API key authentication prevents unauthorized access</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600">Local database is encrypted at rest</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-emerald-100 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-600">All actions are logged for audit purposes</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

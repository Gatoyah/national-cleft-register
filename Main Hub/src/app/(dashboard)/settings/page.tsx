import { requirePagePermission } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default async function SettingsPage() {
  await requirePagePermission("settings.view");
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure the National Cleft Registry system</p>
      </div>

      {/* Registry Information */}
      <Card>
        <CardHeader>
          <CardTitle>Registry Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Registry Name</label>
              <p className="mt-1 text-gray-900">National Cleft Registry - Ghana</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Main Hub</label>
              <p className="mt-1 text-gray-900">Komfo Anokye Teaching Hospital (KATH)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Region</label>
              <p className="mt-1 text-gray-900">Ashanti</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Partner</label>
              <p className="mt-1 text-gray-900">Smile Train</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NCR ID Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>NCR ID Format</CardTitle>
          <CardDescription>Configuration for patient identification numbers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700">Current Format</p>
            <code className="text-lg font-mono">NCR-YYYY-NNNNN</code>
            <p className="text-sm text-gray-500 mt-2">
              Example: NCR-2025-00123
            </p>
          </div>
          <div className="text-sm text-gray-600">
            <p><strong>NCR</strong> - National Cleft Registry prefix</p>
            <p><strong>YYYY</strong> - Year of registration</p>
            <p><strong>NNNNN</strong> - Sequential 5-digit number</p>
          </div>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Audit Log Retention</p>
              <p className="text-sm text-gray-500">How long to keep activity logs</p>
            </div>
            <select className="px-3 py-2 border border-gray-300 rounded-lg">
              <option value="365">1 Year</option>
              <option value="730">2 Years</option>
              <option value="1825">5 Years</option>
              <option value="0">Forever</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Automatic Backup</p>
              <p className="text-sm text-gray-500">Daily database backup</p>
            </div>
            <span className="text-emerald-600 font-medium">Enabled</span>
          </div>
        </CardContent>
      </Card>

      {/* API Keys for Regional Hubs */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>API keys for regional hub synchronization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> API keys are used by regional hub applications to sync data 
              with this main registry. Keep these keys secure.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="font-medium">Korle Bu Teaching Hospital</p>
                <code className="text-xs text-gray-500">kb_*****_2025</code>
              </div>
              <Button variant="outline" size="sm">Regenerate</Button>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div>
                <p className="font-medium">Tamale Teaching Hospital</p>
                <code className="text-xs text-gray-500">th_*****_2025</code>
              </div>
              <Button variant="outline" size="sm">Regenerate</Button>
            </div>
          </div>
          <Button variant="outline">Generate New API Key</Button>
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance & Standards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Ghana Data Protection Act, 2012 (Act 843) compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>LAHSAL cleft classification standard</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>ICD-10/ICD-11 diagnostic coding</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Smile Train data standards compatible</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

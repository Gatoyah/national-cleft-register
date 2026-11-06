import { HUB_NAME } from "@/lib/app-info";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-4">
            <span className="text-white font-bold text-2xl">N</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">National Cleft Registry</h1>
          <p className="text-gray-600 mt-1">Ghana — {HUB_NAME}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ message, details }: { message: string; details?: string[] }) {
  if (!message) return null;
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
      {message}
      {details && details.length > 0 && (
        <ul className="list-disc ml-5 mt-1">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const PASSWORD_HINT = "At least 12 characters with upper- and lower-case letters, a number and a symbol.";

/** Turn an API error JSON body into a message + list of details. */
export function describeApiError(data: { error?: string; details?: unknown }): { message: string; details: string[] } {
  const details = Array.isArray(data?.details)
    ? data.details.map((d: unknown) => (typeof d === "string" ? d : (d as { message?: string; path?: string })?.path ? `${(d as { path: string }).path}: ${(d as { message: string }).message}` : String((d as { message?: string })?.message ?? d)))
    : [];
  return { message: data?.error || "Something went wrong", details };
}

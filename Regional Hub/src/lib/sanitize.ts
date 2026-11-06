/**
 * Input normalisation.
 *
 * We deliberately do NOT HTML-escape or strip characters before storing data:
 * that corrupts real patient data (e.g. "O'Brien" -> "O&#x27;Brien") and
 * breaks research analysis. XSS is prevented at output time instead — React
 * escapes everything it renders, and no page uses dangerouslySetInnerHTML.
 * SQL injection is prevented by Drizzle's parameterised queries.
 *
 * Here we only trim whitespace, remove control characters (incl. NUL) and cap
 * string length so nothing malformed reaches the database.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_STRING_LENGTH = 10_000;

export function sanitizeString(input: string): string {
  return input.replace(CONTROL_CHARS, "").trim().slice(0, MAX_STRING_LENGTH);
}

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === "object") return sanitizeObject(value as Record<string, unknown>);
  return value;
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = sanitizeValue(value);
  }
  return result as T;
}

/** Convert "" to null so optional fields are stored as NULL, not empty strings. */
export function emptyToNull<T>(value: T | "" | undefined): T | null {
  return value === "" || value === undefined ? null : (value as T);
}

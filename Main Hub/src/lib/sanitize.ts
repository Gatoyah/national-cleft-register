/**
 * Input sanitisation utilities to prevent XSS attacks.
 * Strips HTML tags and encodes special characters in user-provided strings.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

const HTML_SPECIAL_CHARS_REGEX = /[&<>"'/]/g;

/**
 * Encode HTML special characters in a string to prevent XSS.
 */
export function escapeHtml(input: string): string {
  return input.replace(
    HTML_SPECIAL_CHARS_REGEX,
    (char) => HTML_ENTITY_MAP[char] || char
  );
}

/**
 * Strip all HTML tags from a string.
 */
export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Sanitise a single string value: strip HTML tags and encode special characters.
 */
export function sanitizeString(input: string): string {
  return escapeHtml(stripHtmlTags(input.trim()));
}

/**
 * Recursively sanitise all string values in an object.
 * Returns a new object with sanitised string values.
 * Non-string values are passed through unchanged.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === "string") return sanitizeString(item);
        if (item !== null && typeof item === "object") return sanitizeObject(item as Record<string, unknown>);
        return item;
      });
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

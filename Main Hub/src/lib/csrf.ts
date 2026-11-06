/**
 * CSRF token utilities using HMAC-based token generation.
 * Tokens are tied to the user's session to prevent cross-site request forgery.
 */

import crypto from "crypto";
import { requireHexSecret } from "@/lib/env";

// No insecure fallback: a missing/placeholder secret fails loudly.
const secret = () => requireHexSecret("CSRF_SECRET");

/**
 * Generate a CSRF token tied to the session token.
 * The token is an HMAC of the session token + timestamp, making it
 * unforgeable without knowing the secret.
 */
export function generateCsrfToken(sessionToken: string): string {
  const timestamp = Date.now().toString(36);
  const hmac = crypto
    .createHmac("sha256", secret())
    .update(`${sessionToken}:${timestamp}`)
    .digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Validate a CSRF token against the session token.
 * Tokens older than 4 hours are rejected.
 */
export function validateCsrfToken(
  token: string,
  sessionToken: string
): boolean {
  if (!token || !sessionToken) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, providedHmac] = parts;

  // Check token age (4 hours max)
  const tokenAge = Date.now() - parseInt(timestamp, 36);
  const MAX_TOKEN_AGE_MS = 4 * 60 * 60 * 1000;
  if (isNaN(tokenAge) || tokenAge > MAX_TOKEN_AGE_MS || tokenAge < 0) {
    return false;
  }

  // Recompute HMAC and compare
  const expectedHmac = crypto
    .createHmac("sha256", secret())
    .update(`${sessionToken}:${timestamp}`)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(providedHmac, "hex"),
      Buffer.from(expectedHmac, "hex")
    );
  } catch {
    return false;
  }
}

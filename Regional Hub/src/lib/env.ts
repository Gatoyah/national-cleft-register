/**
 * Central runtime configuration + validation.
 *
 * Secrets are validated lazily (on first use, at request time) rather than at
 * import time, so `next build` works without a .env file. If a required secret
 * is missing or still set to a placeholder, the request fails loudly instead of
 * silently falling back to an insecure default.
 */

const HEX64 = /^[0-9a-fA-F]{64}$/;

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith("replace-with") || value.trim() === "";
}

export class ConfigError extends Error {}

export function requireHexSecret(name: string): string {
  const value = process.env[name];
  if (isPlaceholder(value) || !HEX64.test(value!)) {
    throw new ConfigError(
      `${name} is missing or invalid. It must be a 64-character hex string. ` +
        `Run "node setup-env.mjs" in the app folder to generate one.`
    );
  }
  return value!;
}

export function requireSecret(name: string, minLength = 32): string {
  const value = process.env[name];
  if (isPlaceholder(value) || value!.length < minLength) {
    throw new ConfigError(
      `${name} is missing or too short (min ${minLength} chars). ` +
        `Run "node setup-env.mjs" in the app folder to generate one.`
    );
  }
  return value!;
}

/**
 * Whether cookies should carry the `Secure` flag.
 * - COOKIE_SECURE=true|false forces it.
 * - Otherwise it follows the request protocol (https => secure). This keeps
 *   logins working on a plain-http hospital LAN while still protecting cookies
 *   whenever the app is served over HTTPS (directly or via a reverse proxy).
 */
export function cookieSecure(forwardedProto: string | null, requestProtocol?: string): boolean {
  const forced = process.env.COOKIE_SECURE;
  if (forced === "true") return true;
  if (forced === "false") return false;
  if (forwardedProto) return forwardedProto.split(",")[0].trim() === "https";
  return requestProtocol === "https:";
}

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

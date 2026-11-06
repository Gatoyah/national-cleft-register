import crypto from "crypto";
import { requireHexSecret } from "@/lib/env";

/**
 * AES-256-GCM encryption for the Main Hub sync API key stored in this hub's
 * database. ENCRYPTION_KEY is mandatory — there is no random fallback (a random
 * per-process key used to make the saved key undecryptable after a restart).
 */
const key = () => Buffer.from(requireHexSecret("ENCRYPTION_KEY"), "hex");

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, dataHex] = encryptedText.split(":");
  if (!ivHex || !tagHex || dataHex === undefined) throw new Error("Invalid encrypted format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

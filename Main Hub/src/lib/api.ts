import { NextResponse } from "next/server";
import { z } from "zod";
import { ConfigError } from "@/lib/env";

/** Uniform error responses. Never leaks stack traces or SQL to the client. */
export function apiError(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation error", details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 }
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (error instanceof ConfigError) {
    console.error("[config]", error.message);
    return NextResponse.json({ error: "Server is not configured correctly. See server log." }, { status: 500 });
  }
  const msg = String((error as Error)?.message || "") + String((error as { cause?: Error })?.cause?.message || "");
  if (msg.includes("UNIQUE constraint failed")) {
    return NextResponse.json({ error: "A record with these details already exists" }, { status: 409 });
  }
  console.error(fallbackMessage, error);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Reusable field validators
export const REGIONS = [
  "ashanti", "greater_accra", "northern", "western", "eastern",
  "central", "volta", "upper_east", "upper_west", "bono",
  "bono_east", "ahafo", "western_north", "oti", "north_east", "savannah",
] as const;

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

export const optionalIsoDate = z.union([isoDate, z.literal("")]).optional().nullable();
export const optionalText = (max = 255) => z.string().max(max).optional().nullable();

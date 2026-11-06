import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth";
import { generateCsrfToken } from "@/lib/csrf";

/**
 * GET /api/auth/csrf
 * Returns a CSRF token tied to the current session.
 * The client should include this token in the `x-csrf-token` header
 * for all state-changing requests (POST, PUT, DELETE, PATCH).
 */
export async function GET() {
  try {
    const sessionToken = await getSessionToken();

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const csrfToken = generateCsrfToken(sessionToken);

    return NextResponse.json({ csrfToken });
  } catch (error) {
    console.error("Error generating CSRF token:", error);
    return NextResponse.json(
      { error: "Failed to generate CSRF token" },
      { status: 500 }
    );
  }
}

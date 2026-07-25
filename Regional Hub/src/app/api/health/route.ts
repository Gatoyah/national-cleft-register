import { NextResponse } from "next/server";
import { db, client } from "@/db";

export async function GET() {
  try {
    await client.execute("SELECT 1");

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "ncr-regional-hub",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: "Database connection failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

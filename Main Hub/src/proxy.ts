import { NextRequest, NextResponse } from "next/server";

/**
 * Cross-site request forgery defence in depth (on top of SameSite=strict
 * cookies and CSRF tokens): any state-changing API request sent by a browser
 * must come from this same site. Browsers always attach an Origin header to
 * cross-site POST/PATCH/DELETE requests, so a mismatched Origin is rejected.
 *
 * Machine-to-machine sync endpoints (/api/sync/*) are authenticated with a
 * per-hub API key instead of cookies, so they are exempt.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SAFE_METHODS.has(request.method) || pathname.startsWith("/api/sync/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || originHost !== host) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
  } else if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

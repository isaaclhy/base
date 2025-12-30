import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Only run redirects in production
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";

  // Skip redirect for localhost
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    return NextResponse.next();
  }

  // Redirect www to non-www (canonical domain)
  // If you prefer www, change this to: !hostname.startsWith("www.")
  const shouldRedirectToNonWww = hostname.startsWith("www.");

  if (shouldRedirectToNonWww) {
    // Remove www. from hostname
    const nonWwwHostname = hostname.replace(/^www\./, "");
    url.hostname = nonWwwHostname;
    
    // Preserve the path and query string
    return NextResponse.redirect(url, 301); // 301 = permanent redirect
  }

  return NextResponse.next();
}

// Only run middleware on production (not localhost)
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};


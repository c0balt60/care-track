import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/") ? withRequestId(request) : requireSignIn(request);
}

// Gives every API request an id so its log lines can be grouped (see lib/logger.ts).
function withRequestId(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

// Sends signed-out visitors on (app) routes to /login, remembering where they were going.
//
// This only checks that a session cookie exists; it doesn't look the session up, because
// Proxy runs on every request (prefetches too) and the docs say to keep it to cookie reads.
// A stale or forged cookie gets through here, so pages must still call requireRole /
// getViewer from lib/auth.ts. This is the fast first filter, not the security check.
function requireSignIn(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Route groups like (app) aren't part of the URL, so each top-level folder in
  // app/(app) is listed here. Add new ones when you add a folder there.
  matcher: [
    "/api/:path*",
    "/appointments/:path*",
    "/availability/:path*",
    "/book/:path*",
    "/clinic/:path*",
    "/dashboard/:path*",
    "/settings/:path*",
  ],
};
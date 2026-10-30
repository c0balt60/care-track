import { NextResponse, type NextRequest } from "next/server";

// Gives every API request an id so its log lines can be grouped (see lib/logger.ts).
export function proxy(request: NextRequest) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const headers = new Headers(request.headers);
    headers.set("x-request-id", requestId);

    const response = NextResponse.next({ request: { headers } });
    response.headers.set("x-request-id", requestId);
    return response;
}

export const config = {
    matcher: "/api/:path*",
};

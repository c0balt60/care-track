// @vitest-environment node
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "../proxy";

const SESSION_COOKIE = "better-auth.session_token=abc.signature";

function visit(path: string, cookie?: string) {
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }));
}

describe("proxy: signed-out redirect", () => {
  it.each(["/dashboard", "/appointments", "/appointments/a1", "/availability", "/book/rivera_123", "/clinic", "/clinic/book", "/settings"])(
    "sends a signed-out visitor on %s to /login with next",
    (path) => {
      const res = visit(path);
      expect(res.status).toBe(307);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/login");
      expect(to.searchParams.get("next")).toBe(path);
    },
  );

  it("keeps the query string in next", () => {
    const to = new URL(visit("/clinic/book?patient=jordan&day=3").headers.get("location")!);
    expect(to.searchParams.get("next")).toBe("/clinic/book?patient=jordan&day=3");
  });

  it("lets a visitor with a session cookie through", () => {
    const res = visit("/dashboard", SESSION_COOKIE);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("accepts the __Secure- cookie Better Auth uses over HTTPS", () => {
    const res = visit("/dashboard", `__Secure-${SESSION_COOKIE}`);
    expect(res.headers.get("location")).toBeNull();
  });

  it("never redirects API requests, and still tags them with a request id", () => {
    const res = visit("/api/health");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("proxy: matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it.each(["/dashboard", "/appointments/a1", "/book/x", "/clinic/book", "/settings", "/api/auth/session"])("runs on %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each(["/", "/login", "/signup", "/practitioners/rivera", "/_next/static/chunk.js", "/favicon.ico"])(
    "skips public path %s",
    (url) => {
      expect(matches(url)).toBe(false);
    },
  );
});
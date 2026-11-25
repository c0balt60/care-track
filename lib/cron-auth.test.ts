import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";
import { PUBLIC_DEV_SECRET } from "./public-secret";

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/reminders", { headers: authorization ? { authorization } : {} });

describe("isCronAuthorized", () => {
  it("accepts the right bearer token", () => {
    expect(isCronAuthorized(request("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a missing, wrong or malformed token", () => {
    expect(isCronAuthorized(request(), "s3cret")).toBe(false);
    expect(isCronAuthorized(request("Bearer nope"), "s3cret")).toBe(false);
    expect(isCronAuthorized(request("s3cret"), "s3cret")).toBe(false);
    expect(isCronAuthorized(request("Bearer s3cret extra"), "s3cret")).toBe(false);
  });

  it("refuses the public secret from .env.example on a Vercel deployment, but not locally", () => {
    const auth = `Bearer ${PUBLIC_DEV_SECRET}`;
    expect(isCronAuthorized(request(auth), PUBLIC_DEV_SECRET, "production")).toBe(false);
    expect(isCronAuthorized(request(auth), PUBLIC_DEV_SECRET, "preview")).toBe(false);
    expect(isCronAuthorized(request(auth), PUBLIC_DEV_SECRET, undefined)).toBe(true);
  });

  it("refuses everything when no secret is configured", () => {
    expect(isCronAuthorized(request("Bearer undefined"), undefined)).toBe(false);
    expect(isCronAuthorized(request("Bearer "), "")).toBe(false);
    expect(isCronAuthorized(request(), undefined)).toBe(false);
  });
});
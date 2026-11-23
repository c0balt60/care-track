// @vitest-environment node
// On a Vercel preview, log-in must accept the preview's own URLs and nothing else.
// Separate file from better-auth.test.ts because the env is read once, at import.
import { expect, it, vi } from "vitest";

vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
vi.stubEnv("BETTER_AUTH_URL", "https://care-track.vercel.app");
vi.stubEnv("VERCEL_ENV", "preview");
vi.stubEnv("VERCEL_URL", "care-track-abc123-team.vercel.app");
vi.stubEnv("VERCEL_BRANCH_URL", "care-track-git-feat-x-team.vercel.app");

vi.mock("@/lib/db", () => ({ db: {} })); // never queried here

const { auth } = await import("@/lib/better-auth");

it("trusts the preview's branch and commit URLs, not other Vercel sites", async () => {
  const ctx = await auth.$context;
  expect(ctx.baseURL).toBe("https://care-track-git-feat-x-team.vercel.app/api/auth");
  expect(ctx.isTrustedOrigin("https://care-track-git-feat-x-team.vercel.app")).toBe(true);
  expect(ctx.isTrustedOrigin("https://care-track-abc123-team.vercel.app")).toBe(true);
  expect(ctx.isTrustedOrigin("https://evil.vercel.app")).toBe(false);
});

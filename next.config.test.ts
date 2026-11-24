import { expect, test } from "vitest";
import nextConfig from "./next.config";

test("security headers apply to every path", async () => {
  const [rule, ...rest] = await nextConfig.headers!();
  expect(rest).toHaveLength(0);
  expect(rule.source).toBe("/(.*)");

  const headers = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
  expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
});

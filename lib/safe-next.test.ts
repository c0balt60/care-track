import { expect, test } from "vitest";
import { safeNext } from "@/lib/safe-next";

test("keeps same-site paths", () => {
  expect(safeNext("/appointments")).toBe("/appointments");
  expect(safeNext("/book/abc?reschedule=1#top")).toBe("/book/abc?reschedule=1#top");
});

test("falls back when next is missing or not a string", () => {
  expect(safeNext(undefined)).toBe("/dashboard");
  expect(safeNext(null)).toBe("/dashboard");
  expect(safeNext("")).toBe("/dashboard");
  expect(safeNext(["/a", "/b"])).toBe("/dashboard");
});

test("blocks other sites", () => {
  for (const evil of [
    "https://evil.com",
    "http://evil.com/dashboard",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
  ]) {
    expect(safeNext(evil), evil).toBe("/dashboard");
  }
});

test("uses the given fallback", () => {
  expect(safeNext("//evil.com", "/")).toBe("/");
});

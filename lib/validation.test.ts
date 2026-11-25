import { expect, test } from "vitest";
import { z } from "zod";
import { commaList, isId, optionalText, parse, requiredText } from "./validation";

const schema = z.object({ name: requiredText(5, "name"), bio: optionalText(5, "bio"), tags: commaList(2, "tags") });
const form = (fields: Record<string, string | Blob>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

test("parse() cleans FormData and fills optional fields", () => {
  expect(parse(schema, form({ name: " Ann ", tags: "a, b, a, " }))).toEqual({
    ok: true,
    data: { name: "Ann", bio: "", tags: ["a", "b"] },
  });
  expect(parse(schema, form({ name: "Ann" }))).toEqual({ ok: true, data: { name: "Ann", bio: "", tags: [] } });
});

test("parse() returns the first failing field's key, never Zod's text", () => {
  expect(parse(schema, form({}))).toEqual({ ok: false, error: "name" });
  expect(parse(schema, form({ name: "toolong" }))).toEqual({ ok: false, error: "name" });
  expect(parse(schema, form({ name: "Ann", bio: "toolong" }))).toEqual({ ok: false, error: "bio" });
  expect(parse(schema, form({ name: "Ann", tags: "a,b,c" }))).toEqual({ ok: false, error: "tags" });
  expect(parse(schema, form({ name: "Ann", tags: "x".repeat(101) }))).toEqual({ ok: false, error: "tags" });
  // A file where text belongs.
  expect(parse(schema, form({ name: new Blob(["x"]) }))).toEqual({ ok: false, error: "name" });
});

test("optionalText treats null (a missing formData.get) as empty", () => {
  expect(parse(optionalText(5, "note"), null)).toEqual({ ok: true, data: "" });
});

test("isId accepts any uuid-shaped id, including made-up seed ids", () => {
  expect(isId("11111111-1111-1111-1111-111111111111")).toBe(true);
  expect(isId("0B1F3C3E-8F0E-4A3E-9C3E-1A2B3C4D5E6F")).toBe(true);
  expect(isId("not-a-uuid")).toBe(false);
  expect(isId(null)).toBe(false);
});

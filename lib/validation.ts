// Shared Zod pieces for validating untrusted input (HRD-3 #37). Every server action
// and route handler checks what the browser sends through a schema built from these.
//
// Each field sets `{ error: "<key>" }`, which Zod applies to all of that field's checks
// (wrong type, too short, too long, bad format). So a failed parse returns one of the
// page's error keys, which the page looks up in its message table. Text the user
// typed never ends up in the URL or on the page.
import { z } from "zod";

export type Parsed<T, K extends string = string> = { ok: true; data: T } | { ok: false; error: K };

/**
 * Validates `input` (a FormData or a plain value) against `schema`. Returns the cleaned
 * data, or the error key of the first field that failed, in the schema's field order.
 */
export function parse<T, K extends string = string>(schema: z.ZodType<T>, input: unknown): Parsed<T, K> {
  // FormData → { field: value }. A repeated field keeps its last value; none of our forms repeat one.
  const r = schema.safeParse(input instanceof FormData ? Object.fromEntries(input) : input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0].message as K };
}

/**
 * Any 8-4-4-4-12 hex id. Not z.uuid(): that also checks the version and variant digits,
 * and would reject made-up ids like the seed's. Postgres only needs the shape.
 */
export const id = (error = "id") => z.guid({ error });
export const isId = (value: unknown): value is string => id().safeParse(value).success;

/** Required text: trimmed, 1 to `max` characters. */
export const requiredText = (max: number, error: string) => z.string({ error }).trim().min(1).max(max);

/** Optional text: trimmed, at most `max` characters, "" when missing (formData.get() gives null). */
export const optionalText = (max: number, error: string) =>
  z.string({ error }).trim().max(max).nullish().transform((v) => v ?? "");

export const phone = (error = "phone") => z.string({ error }).trim().regex(/^\+?[\d\s().-]{7,20}$/);

/** A real calendar date written YYYY-MM-DD ("2026-02-30" fails). */
export const dayKey = (error: string) => z.iso.date({ error });

/** 24-hour "HH:MM", as <input type="time"> sends it. */
export const time = (error: string) => z.string({ error }).regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** "a, b, a" → ["a", "b"]: trimmed, blanks and repeats dropped, at most `maxItems` of up to 100 characters. */
export const commaList = (maxItems: number, error: string) =>
  z
    .string({ error })
    .prefault("") // prefault, not default: "" still runs through the transform and becomes []
    .transform((s) => [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))])
    .pipe(z.array(z.string({ error }).max(100), { error }).max(maxItems));

import { describe, expect, it } from "vitest";
import { parseBookingSettings, parseException, parseWeeklyHours } from "./availability";
import { generateSlots, type SlotInput } from "./slots";

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};

describe("parseBookingSettings", () => {
  it("accepts a valid mode and slot length", () => {
    expect(parseBookingSettings(form({ mode: "approval", slotMinutes: "45" }))).toEqual({
      ok: true,
      data: { bookingMode: "approval", slotMinutes: 45 },
    });
  });
  it("rejects an unknown mode and out-of-range lengths", () => {
    expect(parseBookingSettings(form({ mode: "auto", slotMinutes: "30" }))).toEqual({ ok: false, error: "bad-mode" });
    expect(parseBookingSettings(form({ mode: "instant", slotMinutes: "0" }))).toEqual({ ok: false, error: "bad-slot-length" });
    expect(parseBookingSettings(form({ mode: "instant", slotMinutes: "481" }))).toEqual({ ok: false, error: "bad-slot-length" });
    expect(parseBookingSettings(form({ mode: "instant", slotMinutes: "abc" }))).toEqual({ ok: false, error: "bad-slot-length" });
  });
});

describe("parseWeeklyHours", () => {
  it("reads checked days, skips blank rows, and ignores unchecked days", () => {
    const result = parseWeeklyHours(
      form({
        "day-1": "on",
        "d1-0-from": "13:00", "d1-0-to": "17:00",
        "d1-1-from": "09:00", "d1-1-to": "12:00",
        "d1-2-from": "", "d1-2-to": "",
        // Tuesday has times but its checkbox is off.
        "d2-0-from": "09:00", "d2-0-to": "17:00",
      }),
    );
    expect(result).toEqual({
      ok: true,
      data: [
        { weekday: 1, startTime: "09:00", endTime: "12:00" },
        { weekday: 1, startTime: "13:00", endTime: "17:00" },
      ],
    });
  });
  it("rejects bad, backwards, half-filled and overlapping ranges", () => {
    const day = (rows: Record<string, string>) => form({ "day-1": "on", ...rows });
    expect(parseWeeklyHours(day({ "d1-0-from": "17:00", "d1-0-to": "09:00" }))).toEqual({ ok: false, error: "bad-range" });
    expect(parseWeeklyHours(day({ "d1-0-from": "09:00", "d1-0-to": "" }))).toEqual({ ok: false, error: "bad-time" });
    expect(parseWeeklyHours(day({ "d1-0-from": "9am", "d1-0-to": "5pm" }))).toEqual({ ok: false, error: "bad-time" });
    expect(
      parseWeeklyHours(day({ "d1-0-from": "09:00", "d1-0-to": "12:00", "d1-1-from": "11:00", "d1-1-to": "15:00" })),
    ).toEqual({ ok: false, error: "overlap" });
  });
});

describe("parseException", () => {
  const today = "2026-12-01";
  it("accepts a closed day and a custom-hours day", () => {
    expect(parseException(form({ date: "2026-12-25", kind: "closed", note: " Holiday " }), today)).toEqual({
      ok: true,
      data: { date: "2026-12-25", startTime: null, endTime: null, note: "Holiday" },
    });
    expect(parseException(form({ date: "2026-12-24", kind: "hours", from: "10:00", to: "14:00" }), today)).toEqual({
      ok: true,
      data: { date: "2026-12-24", startTime: "10:00", endTime: "14:00", note: "" },
    });
  });
  it("rejects past, impossible and malformed input", () => {
    expect(parseException(form({ date: "2026-11-30", kind: "closed" }), today)).toEqual({ ok: false, error: "past-date" });
    expect(parseException(form({ date: "2026-02-30", kind: "closed" }), today)).toEqual({ ok: false, error: "bad-date" });
    expect(parseException(form({ date: "2026-12-25", kind: "hours", from: "14:00", to: "10:00" }), today)).toEqual({ ok: false, error: "bad-range" });
    expect(parseException(form({ date: "2026-12-25", kind: "nope" }), today)).toEqual({ ok: false, error: "bad-kind" });
  });
});

// "Done when: changes affect generated slots." Mondays, 9:00-12:00 as the DB returns them.
describe("saved availability changes the generated slots", () => {
  const monday = "2026-12-07";
  const base: Omit<SlotInput, "slotMinutes"> = {
  timeZone: "America/Toronto",
  from: monday,
  days: 1,
  exceptions: [],
  rules: [{ weekday: 1, startTime: "09:00:00", endTime: "12:00:00" }],
};

  it("slot length changes how many slots fit", () => {
    expect(generateSlots({ ...base, slotMinutes: 30 })).toHaveLength(6);
    expect(generateSlots({ ...base, slotMinutes: 60 })).toHaveLength(3);
  });
  it("a closed exception removes the day, and a custom-hours exception replaces the weekly hours", () => {
    const closed = [{ date: monday, startTime: null, endTime: null }];
    const short = [{ date: monday, startTime: "10:00:00", endTime: "11:00:00" }];
    expect(generateSlots({ ...base, slotMinutes: 30, exceptions: closed })).toHaveLength(0);
    expect(generateSlots({ ...base, slotMinutes: 30, exceptions: short })).toHaveLength(2);
  });
});
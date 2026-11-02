import { describe, expect, test } from "vitest";
import { generateSlots, type DateException, type SlotInput, type WeeklyRule } from "@/lib/slots";

const NY = "America/New_York";

// 2026 calendar: Mon Nov 2. DST starts Sun Mar 8 and ends Sun Nov 1 in the US.
const rule = (weekday: number, startTime: string, endTime: string): WeeklyRule => ({ weekday, startTime, endTime });
const closed = (date: string): DateException => ({ date, startTime: null, endTime: null });

function slots(overrides: Partial<SlotInput>) {
  return generateSlots({ timeZone: NY, slotMinutes: 30, rules: [], exceptions: [], from: "2026-11-02", days: 1, ...overrides });
}
const starts = (s: ReturnType<typeof generateSlots>) => s.map((x) => x.start.toISOString());
const lengths = (s: ReturnType<typeof generateSlots>) => s.map((x) => (x.end.getTime() - x.start.getTime()) / 60_000);

describe("weekly hours", () => {
  test("steps through a range in slotMinutes", () => {
    const s = slots({ rules: [rule(1, "09:00", "10:30")] });
    // 9:00 EST = 14:00 UTC
    expect(starts(s)).toEqual(["2026-11-02T14:00:00.000Z", "2026-11-02T14:30:00.000Z", "2026-11-02T15:00:00.000Z"]);
    expect(lengths(s)).toEqual([30, 30, 30]);
  });

  test("accepts Postgres time strings with seconds", () => {
    expect(slots({ rules: [rule(1, "09:00:00", "10:00:00")] })).toHaveLength(2);
  });

  test("only makes whole slots", () => {
    expect(slots({ rules: [rule(1, "09:00", "09:50")] })).toHaveLength(1);
    expect(slots({ rules: [rule(1, "09:00", "09:20")] })).toHaveLength(0);
  });

  test("a split day gives slots from both ranges and none in the gap", () => {
    const s = slots({ slotMinutes: 60, rules: [rule(1, "13:00", "15:00"), rule(1, "09:00", "11:00")] });
    // Sorted even though the afternoon rule came first
    expect(starts(s)).toEqual([
      "2026-11-02T14:00:00.000Z",
      "2026-11-02T15:00:00.000Z",
      "2026-11-02T18:00:00.000Z",
      "2026-11-02T19:00:00.000Z",
    ]);
  });

  test("overlapping ranges don't duplicate a slot", () => {
    const s = slots({ slotMinutes: 60, rules: [rule(1, "09:00", "11:00"), rule(1, "10:00", "12:00")] });
    expect(starts(s)).toEqual(["2026-11-02T14:00:00.000Z", "2026-11-02T15:00:00.000Z", "2026-11-02T16:00:00.000Z"]);
  });

  test("uses each day's weekday across the window", () => {
    // Mon and Wed only, over a full week starting Monday
    const s = slots({ slotMinutes: 60, days: 7, rules: [rule(1, "09:00", "10:00"), rule(3, "09:00", "10:00")] });
    expect(starts(s)).toEqual(["2026-11-02T14:00:00.000Z", "2026-11-04T14:00:00.000Z"]);
  });

  test("no rules means no slots", () => {
    expect(slots({ days: 28 })).toEqual([]);
  });

  test("rejects a slot length that would loop forever", () => {
    expect(() => slots({ slotMinutes: 0, rules: [rule(1, "09:00", "10:00")] })).toThrow(RangeError);
    expect(() => slots({ slotMinutes: -30 })).toThrow(RangeError);
  });
});

describe("exceptions", () => {
  const monday = [rule(1, "09:00", "17:00")];

  test("a closed day has no slots", () => {
    expect(slots({ rules: monday, exceptions: [closed("2026-11-02")] })).toEqual([]);
  });

  test("special hours replace the weekly hours for that date", () => {
    const s = slots({ slotMinutes: 60, rules: monday, exceptions: [{ date: "2026-11-02", startTime: "12:00", endTime: "14:00" }] });
    expect(starts(s)).toEqual(["2026-11-02T17:00:00.000Z", "2026-11-02T18:00:00.000Z"]);
  });

  test("an exception can open a day with no weekly hours", () => {
    // Saturday Nov 7 has no rule
    const s = slots({ from: "2026-11-07", slotMinutes: 60, exceptions: [{ date: "2026-11-07", startTime: "10:00", endTime: "11:00" }] });
    expect(starts(s)).toEqual(["2026-11-07T15:00:00.000Z"]);
  });

  test("only touches its own date", () => {
    const s = slots({ days: 14, slotMinutes: 60, rules: [rule(1, "09:00", "10:00")], exceptions: [closed("2026-11-02")] });
    expect(starts(s)).toEqual(["2026-11-09T14:00:00.000Z"]);
  });
});

describe("daylight saving weeks", () => {
  test("a normal day keeps its local hours when clocks spring forward", () => {
    const s = slots({ from: "2026-03-08", rules: [rule(0, "09:00", "17:00")] });
    expect(s).toHaveLength(16);
    expect(s[0].start.toISOString()).toBe("2026-03-08T13:00:00.000Z"); // 9:00 EDT
    expect(lengths(s).every((n) => n === 30)).toBe(true);
  });

  test("a normal day keeps its local hours when clocks fall back", () => {
    const s = slots({ from: "2026-11-01", rules: [rule(0, "09:00", "17:00")] });
    expect(s).toHaveLength(16);
    expect(s[0].start.toISOString()).toBe("2026-11-01T14:00:00.000Z"); // 9:00 EST
    expect(lengths(s).every((n) => n === 30)).toBe(true);
  });

  test("a week that spans the change stays at 9:00 local every day", () => {
    const daily = [0, 1, 2, 3, 4, 5, 6].map((d) => rule(d, "09:00", "09:30"));
    const s = slots({ from: "2026-10-29", days: 7, rules: daily });
    expect(starts(s)).toEqual([
      "2026-10-29T13:00:00.000Z", // Thu, EDT
      "2026-10-30T13:00:00.000Z",
      "2026-10-31T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z", // Sun, EST from here
      "2026-11-02T14:00:00.000Z",
      "2026-11-03T14:00:00.000Z",
      "2026-11-04T14:00:00.000Z",
    ]);
  });

  test("skips the hour that doesn't exist when clocks spring forward", () => {
    // 2:00–2:59 never happens on Mar 8; 1:59 EST is followed by 3:00 EDT
    const s = slots({ from: "2026-03-08", rules: [rule(0, "01:00", "04:00")] });
    expect(starts(s)).toEqual([
      "2026-03-08T06:00:00.000Z", // 1:00 EST
      "2026-03-08T06:30:00.000Z", // 1:30 EST
      "2026-03-08T07:00:00.000Z", // 3:00 EDT
      "2026-03-08T07:30:00.000Z", // 3:30 EDT
    ]);
    expect(lengths(s).every((n) => n === 30)).toBe(true);
  });

  test("books the repeated hour once when clocks fall back", () => {
    // 1:00–1:59 happens twice on Nov 1; slots use the first (EDT) one
    const s = slots({ from: "2026-11-01", rules: [rule(0, "00:00", "03:00")] });
    expect(starts(s)).toEqual([
      "2026-11-01T04:00:00.000Z", // 0:00 EDT
      "2026-11-01T04:30:00.000Z",
      "2026-11-01T05:00:00.000Z", // 1:00 EDT
      "2026-11-01T05:30:00.000Z", // 1:30 EDT
      "2026-11-01T07:00:00.000Z", // 2:00 EST
      "2026-11-01T07:30:00.000Z", // 2:30 EST
    ]);
    // No slot overlaps the next one
    for (let i = 1; i < s.length; i++) expect(s[i].start.getTime()).toBeGreaterThanOrEqual(s[i - 1].end.getTime());
  });

  test("works in zones ahead of UTC too", () => {
    // London springs forward at 1:00 GMT on Sun Mar 29, 2026
    const s = generateSlots({
      timeZone: "Europe/London",
      slotMinutes: 60,
      rules: [rule(0, "00:00", "03:00")],
      exceptions: [],
      from: "2026-03-29",
      days: 1,
    });
    expect(starts(s)).toEqual(["2026-03-29T00:00:00.000Z", "2026-03-29T01:00:00.000Z"]); // 0:00 GMT, 2:00 BST
  });
});

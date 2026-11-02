import { expect, test } from "vitest";
import { addDays, dayKey, minuteOfDay, toMinutes, weekday, zoned } from "@/lib/dates";

const NY = "America/New_York";

test("addDays rolls over months and years", () => {
  expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
});

test("zoned picks the right offset on daylight saving days", () => {
  // DST starts Mar 8 and ends Nov 1 in 2026
  expect(zoned("2026-03-08", toMinutes("09:00"), NY).toISOString()).toBe("2026-03-08T13:00:00.000Z");
  expect(zoned("2026-11-01", toMinutes("09:00"), NY).toISOString()).toBe("2026-11-01T14:00:00.000Z");
});

test("zoned is right in the hour after a daylight saving change", () => {
  // The first offset guess lands on the wrong side of the change here
  expect(zoned("2026-03-08", toMinutes("03:00"), NY).toISOString()).toBe("2026-03-08T07:00:00.000Z"); // 3:00 EDT
  expect(zoned("2026-11-01", toMinutes("02:00"), NY).toISOString()).toBe("2026-11-01T07:00:00.000Z"); // 2:00 EST
  // A time that happens twice gives the first one
  expect(zoned("2026-11-01", toMinutes("01:30"), NY).toISOString()).toBe("2026-11-01T05:30:00.000Z"); // 1:30 EDT
});

test("minuteOfDay reads the wall clock", () => {
  expect(minuteOfDay(new Date("2026-11-02T14:30:00Z"), NY)).toBe(570); // 9:30 EST
  expect(minuteOfDay(new Date("2026-11-02T14:30:00Z"), "UTC")).toBe(870);
});

test("dayKey undoes zoned", () => {
  const late = zoned("2026-10-08", toMinutes("23:30"), NY);
  expect(dayKey(late, NY)).toBe("2026-10-08");
  expect(dayKey(late, "UTC")).toBe("2026-10-09");
});

test("weekday counts from Sunday", () => {
  expect(weekday("2026-03-08")).toBe(0);
});

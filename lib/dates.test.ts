import { expect, test } from "vitest";
import { addDays, dayKey, toMinutes, weekday, zoned } from "@/lib/dates";

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

test("dayKey undoes zoned", () => {
  const late = zoned("2026-10-08", toMinutes("23:30"), NY);
  expect(dayKey(late, NY)).toBe("2026-10-08");
  expect(dayKey(late, "UTC")).toBe("2026-10-09");
});

test("weekday counts from Sunday", () => {
  expect(weekday("2026-03-08")).toBe(0);
});

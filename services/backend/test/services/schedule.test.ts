import { describe, expect, it } from "vitest";
import type { MedicationDetails } from "../../src/services/medicationTypes";
import { expandSchedule } from "../../src/services/schedule";

function medication(overrides: Partial<MedicationDetails> = {}): MedicationDetails {
  return {
    recipientId: "recipient",
    dosage: "1 tablet",
    form: "tablet",
    color: "blue",
    schedule: { type: "daily", times: ["08:00", "20:00"] },
    startDate: "2026-01-01",
    timezone: "UTC",
    active: true,
    ...overrides,
  };
}

function expand(med: MedicationDetails, from: string, to: string): string[] {
  return expandSchedule(med, new Date(from), new Date(to)).map((date) => date.toISOString());
}

describe("expandSchedule", () => {
  it("expands daily UTC doses with inclusive from and exclusive to", () => {
    expect(expand(medication(), "2026-01-01T08:00Z", "2026-01-02T08:00Z")).toEqual([
      "2026-01-01T08:00:00.000Z",
      "2026-01-01T20:00:00.000Z",
    ]);
  });

  it("sorts and deduplicates unsorted repeated times without mutating inputs", () => {
    const med = medication({ schedule: { type: "daily", times: ["20:00", "08:00", "08:00"] } });
    const before = JSON.stringify(med);
    const from = new Date("2026-01-01T00:00Z");
    const to = new Date("2026-01-02T00:00Z");
    expect(expandSchedule(med, from, to).map((date) => date.toISOString())).toEqual([
      "2026-01-01T08:00:00.000Z", "2026-01-01T20:00:00.000Z",
    ]);
    expect(JSON.stringify(med)).toBe(before);
    expect(from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it.each([
    ["Asia/Kolkata", "2026-01-01T02:30:00.000Z"],
    ["Asia/Kathmandu", "2026-01-01T02:15:00.000Z"],
    ["America/St_Johns", "2026-01-01T11:30:00.000Z"],
    ["Pacific/Chatham", "2025-12-31T18:15:00.000Z"],
  ])("converts fractional offsets in %s", (timezone, expected) => {
    const med = medication({
      timezone,
      endDate: "2026-01-01",
      schedule: { type: "daily", times: ["08:00"] },
    });
    expect(expand(med, "2025-12-30T00:00Z", "2026-01-03T00:00Z")).toEqual([expected]);
  });

  it.each([
    ["Pacific/Kiritimati", "2025-12-31T10:00:00.000Z"],
    ["Pacific/Pago_Pago", "2026-01-01T11:00:00.000Z"],
  ])("uses the local date at midnight in %s", (timezone, expected) => {
    const med = medication({
      timezone,
      endDate: "2026-01-01",
      schedule: { type: "daily", times: ["00:00"] },
    });
    expect(expand(med, "2025-12-31T00:00Z", "2026-01-03T00:00Z")).toEqual([expected]);
  });

  it("includes the full local end date, not just its UTC date", () => {
    const med = medication({
      timezone: "America/Los_Angeles",
      endDate: "2026-01-01",
      schedule: { type: "daily", times: ["00:00", "23:59"] },
    });
    expect(expand(med, "2025-12-31T00:00Z", "2026-01-03T00:00Z")).toEqual([
      "2026-01-01T08:00:00.000Z", "2026-01-02T07:59:00.000Z",
    ]);
  });

  it("handles month, leap-day, and year boundaries", () => {
    const med = medication({ startDate: "2028-02-28", schedule: { type: "daily", times: ["00:00"] } });
    expect(expand(med, "2028-02-28T00:00Z", "2028-03-02T00:00Z")).toEqual([
      "2028-02-28T00:00:00.000Z", "2028-02-29T00:00:00.000Z", "2028-03-01T00:00:00.000Z",
    ]);
    expect(expand(med, "2028-12-31T00:00Z", "2029-01-02T00:00Z")).toEqual([
      "2028-12-31T00:00:00.000Z", "2029-01-01T00:00:00.000Z",
    ]);
  });

  it("uses local weekdays, with Sunday zero and Saturday six", () => {
    const med = medication({
      timezone: "Pacific/Kiritimati",
      schedule: { type: "weekdays", times: ["00:00"], days: [0, 1, 6, 0] },
    });
    expect(expand(med, "2026-01-02T00:00Z", "2026-01-06T00:00Z")).toEqual([
      "2026-01-02T10:00:00.000Z",
      "2026-01-03T10:00:00.000Z",
      "2026-01-04T10:00:00.000Z",
    ]);
  });

  it.each([undefined, []])("emits no weekdays when days is %s", (days) => {
    const med = medication({ schedule: { type: "weekdays", times: ["08:00"], days } });
    expect(expand(med, "2026-01-01", "2026-01-08")).toEqual([]);
  });

  it("ignores weekday restrictions for daily schedules", () => {
    const med = medication({ schedule: { type: "daily", times: ["08:00"], days: [] } });
    expect(expand(med, "2026-01-01", "2026-01-02")).toEqual(["2026-01-01T08:00:00.000Z"]);
  });

  it("anchors elapsed intervals to the first configured time, not the range or earliest time", () => {
    const med = medication({
      schedule: { type: "interval", times: ["08:00", "01:00"], intervalHours: 7 },
    });
    expect(expand(med, "2026-01-02T00:00Z", "2026-01-03T05:00Z")).toEqual([
      "2026-01-02T05:00:00.000Z", "2026-01-02T12:00:00.000Z",
      "2026-01-02T19:00:00.000Z", "2026-01-03T02:00:00.000Z",
    ]);
  });

  it("supports fractional-hour intervals and millisecond range boundaries", () => {
    const med = medication({
      schedule: { type: "interval", times: ["08:00"], intervalHours: 0.5 },
    });
    expect(expand(med, "2026-01-01T08:00:00.001Z", "2026-01-01T09:00Z")).toEqual([
      "2026-01-01T08:30:00.000Z",
    ]);
  });

  it("includes the interval anchor and excludes an exact upper endpoint", () => {
    const med = medication({
      schedule: { type: "interval", times: ["08:00"], intervalHours: 12 },
    });
    expect(expand(med, "2026-01-01T08:00Z", "2026-01-01T20:00Z")).toEqual([
      "2026-01-01T08:00:00.000Z",
    ]);
    expect(expand(med, "2025-12-30", "2026-01-01T08:00Z")).toEqual([]);
  });

  it("clips intervals to inclusive local start and end dates", () => {
    const med = medication({
      timezone: "Asia/Kathmandu",
      endDate: "2026-01-01",
      schedule: { type: "interval", times: ["00:00"], intervalHours: 8 },
    });
    expect(expand(med, "2025-12-30", "2026-01-03")).toEqual([
      "2025-12-31T18:15:00.000Z", "2026-01-01T02:15:00.000Z", "2026-01-01T10:15:00.000Z",
    ]);
  });

  it.each(["daily", "interval"] as const)("returns nothing for inactive %s schedules", (type) => {
    const med = medication({
      active: false, schedule: { type, times: ["08:00"], intervalHours: 8 },
    });
    expect(expand(med, "2026-01-01", "2026-01-03")).toEqual([]);
  });

  it.each(["daily", "interval"] as const)("returns nothing outside %s treatment dates", (type) => {
    const med = medication({
      startDate: "2026-01-02", endDate: "2026-01-03",
      schedule: { type, times: ["08:00"], intervalHours: 8 },
    });
    expect(expand(med, "2025-12-01", "2026-01-01")).toEqual([]);
    expect(expand(med, "2026-01-04", "2026-01-08")).toEqual([]);
    expect(expand({ ...med, endDate: "2026-01-01" }, "2026-01-01", "2026-01-08")).toEqual([]);
  });

  it("returns nothing for empty and reversed windows", () => {
    expect(expand(medication(), "2026-01-01", "2026-01-01")).toEqual([]);
    expect(expand(medication(), "2026-01-02", "2026-01-01")).toEqual([]);
  });

  describe("DST", () => {
    it("skips nonexistent daily spring-forward times but keeps adjacent days and valid times", () => {
      const med = medication({
        timezone: "America/New_York",
        schedule: { type: "daily", times: ["02:30", "03:30"] },
      });
      expect(expand(med, "2026-03-07T00:00Z", "2026-03-10T00:00Z")).toEqual([
        "2026-03-07T07:30:00.000Z", "2026-03-07T08:30:00.000Z",
        "2026-03-08T07:30:00.000Z",
        "2026-03-09T06:30:00.000Z", "2026-03-09T07:30:00.000Z",
      ]);
    });

    it("emits only the earliest daily fall-back occurrence", () => {
      const med = medication({
        timezone: "America/New_York",
        schedule: { type: "daily", times: ["01:30"] },
      });
      expect(expand(med, "2026-10-31T00:00Z", "2026-11-03T00:00Z")).toEqual([
        "2026-10-31T05:30:00.000Z", "2026-11-01T05:30:00.000Z", "2026-11-02T06:30:00.000Z",
      ]);
      expect(expand(med, "2026-11-01T06:00Z", "2026-11-01T07:00Z")).toEqual([]);
    });

    it("applies the same DST policy to weekday schedules", () => {
      const med = medication({
        timezone: "America/New_York",
        schedule: { type: "weekdays", times: ["02:30"], days: [0] },
      });
      expect(expand(med, "2026-03-07", "2026-03-10")).toEqual([]);
      med.schedule.times = ["01:30"];
      expect(expand(med, "2026-11-01", "2026-11-02")).toEqual(["2026-11-01T05:30:00.000Z"]);
    });

    it("handles a half-hour DST gap and fold", () => {
      const med = medication({
        timezone: "Australia/Lord_Howe",
        schedule: { type: "daily", times: ["02:15"] },
      });
      expect(expand(med, "2026-10-03T12:00Z", "2026-10-04T12:00Z")).toEqual([]);
      med.schedule.times = ["01:45"];
      expect(expand(med, "2026-04-04T12:00Z", "2026-04-05T12:00Z")).toEqual([
        "2026-04-04T14:45:00.000Z",
      ]);
    });

    it("skips an entire nonexistent local date at a date-line change", () => {
      const med = medication({
        timezone: "Pacific/Apia", startDate: "2011-12-29", endDate: "2011-12-31",
        schedule: { type: "daily", times: ["12:00"] },
      });
      expect(expand(med, "2011-12-28", "2012-01-02")).toEqual([
        "2011-12-29T22:00:00.000Z", "2011-12-30T22:00:00.000Z",
      ]);
    });

    it.each([
      ["2026-03-07", "2026-03-08T23:00Z", [
        "2026-03-07T13:00:00.000Z", "2026-03-08T01:00:00.000Z",
        "2026-03-08T13:00:00.000Z",
      ]],
      ["2026-10-31", "2026-11-01T23:00Z", [
        "2026-10-31T12:00:00.000Z", "2026-11-01T00:00:00.000Z",
        "2026-11-01T12:00:00.000Z",
      ]],
    ])("keeps elapsed-hour interval spacing across DST starting %s", (startDate, to, expected) => {
      const med = medication({
        startDate, timezone: "America/New_York",
        schedule: { type: "interval", times: ["08:00"], intervalHours: 12 },
      });
      expect(expand(med, startDate, to)).toEqual(expected);
    });

    it("allows both repeated local hours as distinct elapsed interval doses", () => {
      const med = medication({
        startDate: "2026-11-01", endDate: "2026-11-01", timezone: "America/New_York",
        schedule: { type: "interval", times: ["00:30"], intervalHours: 1 },
      });
      expect(expand(med, "2026-11-01T04:00Z", "2026-11-01T08:00Z")).toEqual([
        "2026-11-01T04:30:00.000Z", "2026-11-01T05:30:00.000Z",
        "2026-11-01T06:30:00.000Z", "2026-11-01T07:30:00.000Z",
      ]);
    });

    it("uses the earliest ambiguous interval anchor", () => {
      const med = medication({
        startDate: "2026-11-01", timezone: "America/New_York",
        schedule: { type: "interval", times: ["01:30"], intervalHours: 2 },
      });
      expect(expand(med, "2026-11-01T05:00Z", "2026-11-01T09:00Z")).toEqual([
        "2026-11-01T05:30:00.000Z", "2026-11-01T07:30:00.000Z",
      ]);
    });

    it("has no interval occurrences when its anchor is nonexistent", () => {
      const med = medication({
        startDate: "2026-03-08", timezone: "America/New_York",
        schedule: { type: "interval", times: ["02:30"], intervalHours: 2 },
      });
      expect(expand(med, "2026-03-08", "2026-03-10")).toEqual([]);
    });

    it("includes all 25 elapsed hours of a fall-back end date", () => {
      const med = medication({
        startDate: "2026-11-01", endDate: "2026-11-01", timezone: "America/New_York",
        schedule: { type: "interval", times: ["00:00"], intervalHours: 1 },
      });
      const result = expand(med, "2026-11-01", "2026-11-03");
      expect(result).toHaveLength(25);
      expect(result[0]).toBe("2026-11-01T04:00:00.000Z");
      expect(result[24]).toBe("2026-11-02T04:00:00.000Z");
    });
  });

  describe("invalid inputs", () => {
    it.each(["2026-02-30", "2026-13-01", "2026-1-01", "not-a-date"])(
      "rejects invalid date %s", (startDate) => {
        expect(() => expand(medication({ startDate }), "2026-01-01", "2026-01-02")).toThrow(RangeError);
        expect(() => expand(medication({ endDate: startDate }), "2026-01-01", "2026-01-02")).toThrow(RangeError);
      }
    );

    it.each(["24:00", "12:60", "8:00", "08:00:00", "not-a-time"])("rejects time %s", (time) => {
      const med = medication({ schedule: { type: "daily", times: [time] } });
      expect(() => expand(med, "2026-01-01", "2026-01-02")).toThrow(RangeError);
    });

    it.each([0, -1, NaN, Infinity, undefined, Number.MIN_VALUE])("rejects interval %s", (intervalHours) => {
      const med = medication({ schedule: { type: "interval", times: ["08:00"], intervalHours } });
      expect(() => expand(med, "2026-01-01", "2026-01-02")).toThrow(RangeError);
    });

    it.each([-1, 7, 1.5, NaN])("rejects weekday %s", (day) => {
      const med = medication({ schedule: { type: "weekdays", times: ["08:00"], days: [day] } });
      expect(() => expand(med, "2026-01-01", "2026-01-02")).toThrow(RangeError);
    });

    it.each(["", "Invalid/Zone"])("rejects timezone %s", (timezone) => {
      expect(() => expand(medication({ timezone }), "2026-01-01", "2026-01-02")).toThrow(RangeError);
    });

    it("rejects empty time lists and invalid range dates", () => {
      expect(() => expand(medication({ schedule: { type: "daily", times: [] } }), "2026-01-01", "2026-01-02")).toThrow(RangeError);
      expect(() => expand(medication(), "invalid", "2026-01-02")).toThrow(RangeError);
      expect(() => expand(medication(), "2026-01-01", "invalid")).toThrow(RangeError);
    });
  });
});

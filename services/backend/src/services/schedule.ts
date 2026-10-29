import type { MedicationDetails } from "./medicationTypes";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError("Schedule dates must use YYYY-MM-DD format");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Invalid schedule date");
  }
  return date.getTime();
}

function parseTime(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RangeError("Schedule times must use HH:mm format");
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours * HOUR + minutes * 60 * 1000;
}

/**
 * Expand a schedule into sorted, unique instants in [fromUtc, toUtc).
 * Calendar dates are inclusive in the medication's timezone. Gaps are skipped
 * and folds use the earliest instant; intervals then advance by elapsed hours.
 * Invalid schedules/range dates throw RangeError; inactive/empty ranges return [].
 */
export function expandSchedule(
  med: MedicationDetails,
  fromUtc: Date,
  toUtc: Date
): Date[] {
  if (!med.active) return [];
  const from = fromUtc.getTime();
  const to = toUtc.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new RangeError("Invalid schedule range");
  }
  if (from >= to) return [];

  const start = parseDate(med.startDate);
  const end = med.endDate === undefined ? Infinity : parseDate(med.endDate);
  const { schedule } = med;
  if (!["daily", "weekdays", "interval"].includes(schedule.type)) {
    throw new RangeError("Invalid schedule type");
  }
  if (!Array.isArray(schedule.times) || schedule.times.length === 0) {
    throw new RangeError("Schedule requires at least one time");
  }
  const times = schedule.times.map(parseTime);
  if (
    schedule.days !== undefined &&
    (!Array.isArray(schedule.days) ||
      schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
  ) {
    throw new RangeError("Schedule weekdays must be integers from 0 to 6");
  }
  if (typeof med.timezone !== "string" || med.timezone.length === 0) {
    throw new RangeError("Schedule requires an IANA timezone");
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: med.timezone,
    calendar: "iso8601",
    numberingSystem: "latn",
    era: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  // Represent local wall-clock fields on a UTC calendar for date arithmetic.
  const localStamp = (instant: number): number => {
    const parts = formatter.formatToParts(new Date(instant));
    const field = (name: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === name)?.value);
    const year = parts.find((part) => part.type === "era")?.value === "BC"
      ? 1 - field("year")
      : field("year");
    const date = new Date(0);
    date.setUTCFullYear(year, field("month") - 1, field("day"));
    date.setUTCHours(field("hour"), field("minute"), field("second"), 0);
    return date.getTime();
  };

  const offsetsFor = (day: number): number[] => {
    const offsets = new Set<number>();
    // Sample both sides of transitions, including fractional and 24-hour jumps.
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = day + hours * HOUR;
      offsets.add(localStamp(sample) - sample);
    }
    return [...offsets];
  };
  const resolve = (wall: number, offsets: number[]): number | undefined => {
    const candidates = offsets
      .map((offset) => wall - offset)
      .filter((instant) => localStamp(instant) === wall);
    return candidates.length === 0 ? undefined : Math.min(...candidates);
  };

  if (schedule.type === "interval") {
    const step = (schedule.intervalHours ?? NaN) * HOUR;
    if (!Number.isFinite(step) || step < 1) {
      throw new RangeError("Schedule interval must be a positive elapsed duration");
    }
    if (start > end) return [];
    const anchor = resolve(start + times[0], offsetsFor(start));
    // A nonexistent first wall time has no instant to anchor the interval to.
    if (anchor === undefined) return [];
    const first = Math.max(0, Math.ceil((from - anchor) / step));
    const limit = Math.min(to, end + 2 * DAY);
    const result: Date[] = [];
    for (let index = first; ; index++) {
      const instant = anchor + index * step;
      if (instant >= limit) break;
      const localDay = Math.floor(localStamp(instant) / DAY) * DAY;
      if (instant >= from && localDay >= start && localDay <= end) {
        result.push(new Date(instant));
      }
    }
    return result;
  }

  // UTC bounds padded for all IANA offsets, including date-line transitions.
  const firstDay = Math.max(start, Math.floor(from / DAY) * DAY - 2 * DAY);
  const lastDay = Math.min(end, Math.floor(to / DAY) * DAY + 2 * DAY);
  const instants = new Set<number>();
  for (let day = firstDay; day <= lastDay; day += DAY) {
    if (
      schedule.type === "weekdays" &&
      !(schedule.days ?? []).includes(new Date(day).getUTCDay())
    ) {
      continue;
    }
    const offsets = offsetsFor(day);
    for (const time of times) {
      const instant = resolve(day + time, offsets);
      if (instant !== undefined && instant >= from && instant < to) {
        instants.add(instant);
      }
    }
  }
  return [...instants].sort((a, b) => a - b).map((instant) => new Date(instant));
}

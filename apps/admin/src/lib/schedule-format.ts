import type { ScheduleRecurrence } from "@showroom/contracts";

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

/** Days in the order the dashboard shows them (Monday first), as 0 (Sunday) to 6. */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** "09:30" to 570. */
export function timeToMinute(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return ((hours ?? 0) * 60 + (minutes ?? 0)) % DAY_MINUTES;
}

/** 570 to "09:30", the value the time pickers use. */
export function minuteToTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** 570 to "9:30 AM", 0 to "12:00 AM". */
export function formatMinute(minute: number) {
  const hours = Math.floor(minute / 60) % 24;
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minute % 60).padStart(2, "0")} ${suffix}`;
}

/** "Every day", "Weekdays", "Weekends", or the days by name. */
export function describeDays(daysOfWeek: number[]) {
  const days = WEEK_DAYS.filter((day) => daysOfWeek.includes(day));
  const key = [...days].sort((a, b) => a - b).join("");
  if (key === "0123456") return "Every day";
  if (key === "12345") return "Weekdays";
  if (key === "06") return "Weekends";
  return days.map((day) => DAY_SHORT[day]).join(", ");
}

/** "9:00 AM – 5:00 PM", "10:00 PM – 2:00 AM next day", or "All day". */
export function describeTimes(recurrence: Pick<ScheduleRecurrence, "startMinute" | "endMinute">) {
  const { startMinute, endMinute } = recurrence;
  if (startMinute === endMinute) return "All day";
  const range = `${formatMinute(startMinute)} – ${formatMinute(endMinute)}`;
  return endMinute < startMinute ? `${range} next day` : range;
}

/** How long one run lasts, in minutes. Equal start and end is a full day. */
export function recurrenceLength(recurrence: Pick<ScheduleRecurrence, "startMinute" | "endMinute">) {
  const length = recurrence.endMinute - recurrence.startMinute;
  return length > 0 ? length : length + DAY_MINUTES;
}

/** Each run as [start, end) minutes from Sunday 00:00. A run may pass the end of the week. */
function weekRuns(recurrence: ScheduleRecurrence) {
  const length = recurrenceLength(recurrence);
  return recurrence.daysOfWeek.map((day) => {
    const start = day * DAY_MINUTES + recurrence.startMinute;
    return [start, start + length] as const;
  });
}

/** Whether two repeating schedules are ever on at the same moment. */
export function recurrencesOverlap(a: ScheduleRecurrence, b: ScheduleRecurrence) {
  return weekRuns(a).some(([aStart, aEnd]) =>
    weekRuns(b).some(([bStart, bEnd]) =>
      // Compare in this week and the neighbouring ones, for runs across Saturday night.
      [-WEEK_MINUTES, 0, WEEK_MINUTES].some((shift) => aStart < bEnd + shift && bStart + shift < aEnd),
    ),
  );
}

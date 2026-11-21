import { format } from "date-fns";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

// Compact relative-age label: "12s", "5m", "3h", "2d". Capped at days.
// Use when the bucket matters more than precision (inbox queue ordering,
// activity timestamps next to a row title).
export function ageLabel(createdAt: string | Date): string {
  const created =
    typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const ms = Date.now() - created.getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < SECONDS_PER_MINUTE) return `${s}s`;
  const m = Math.floor(s / SECONDS_PER_MINUTE);
  if (m < MINUTES_PER_HOUR) return `${m}m`;
  const h = Math.floor(m / MINUTES_PER_HOUR);
  if (h < HOURS_PER_DAY) return `${h}h`;
  const d = Math.floor(h / HOURS_PER_DAY);
  return `${d}d`;
}

// Compact duration formatter: "45m", "1h", "1h 30m". Empty/<=0 renders "—".
// Distinct from `formatMinutesToHours` in utils/taskArrayUtils.ts which uses
// the spaced form ("45 min", "1 h 30 min") for task-tree summaries.
export function formatDurationCompact(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`;
  const h = Math.floor(minutes / MINUTES_PER_HOUR);
  const m = minutes % MINUTES_PER_HOUR;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Time-of-day in user-readable 12h form: "9:30 AM".
export function formatTimeOfDay(date: Date): string {
  return format(date, "h:mm a");
}

// Long-form date: "Monday, June 29".
export function formatLongDate(date: Date): string {
  return format(date, "EEEE, MMMM d");
}

// Short relative-day label for upcoming/past dates: "Today", "Tomorrow",
// "Yesterday", "In 3d", "4d ago". Returns null for dates more than a week
// out — callers fall back to the absolute date.
export function relativeDayLabel(
  date: Date,
  now: Date = new Date(),
): string | null {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (dayStart.getTime() - todayStart.getTime()) / 86400000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff < 7) return `In ${diff}d`;
  if (diff < 0 && diff > -7) return `${-diff}d ago`;
  return null;
}

// Time-of-day greeting, optionally personalized with the first name.
// Brackets: <5 night, <12 morning, <17 afternoon, <21 evening, else night.
export function greetingForHour(hour: number, name?: string | null): string {
  const period =
    hour < 5
      ? "Good night"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : hour < 21
            ? "Good evening"
            : "Good night";
  const firstName = name?.split(" ")[0]?.trim();
  return firstName ? `${period}, ${firstName}` : period;
}
// Compact relative timestamp for the console header. Null means the engine
// hasn't run this session (cold load renders persisted output only).
export function formatLastRun(iso: string | null): string {
  if (!iso) return "—";
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

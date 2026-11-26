// calendar-core owns its date helpers outright: each domain keeps a complete
// copy of the small utilities it uses, so this folder never imports from the
// scheduling engine and the two systems stay independently portable.

const MS_PER_MINUTE = 60_000;

export const dateTimeService = {
  /** Duration in minutes between start and end. */
  getDuration(start: Date | string, end: Date | string): number {
    const startDate = typeof start === "string" ? new Date(start) : start;
    const endDate = typeof end === "string" ? new Date(end) : end;
    return Math.round(
      (endDate.getTime() - startDate.getTime()) / MS_PER_MINUTE
    );
  },

  /** Shift a date by a number of days. */
  shiftDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  /** Set time ("HH:MM") on a date. */
  setTimeOnDate(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(":").map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  },
};

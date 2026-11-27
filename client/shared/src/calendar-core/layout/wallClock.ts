// The time grid is drawn in wall-clock time: a day column always has 24
// labelled hours, so on a DST day an event at 10:00 must still sit on the
// 10:00 line, and a drag of "one day, one hour" must land one calendar day and
// one wall hour later rather than a fixed number of elapsed minutes (which
// is off by an hour across the transition). Every conversion between an
// instant and a grid position goes through these, which keeps the
// local-timezone assumption in one place: a display-timezone option replaces
// this file.

/** Minutes past local midnight shown on the clock (seconds dropped). */
export function wallMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * The instant at `minute` wall-clock minutes into `day`'s calendar date.
 * 1440 is the next midnight.
 */
export function atWallMinute(day: Date, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute);
}

/** `date` moved by whole calendar days, then by wall-clock minutes. */
export function shiftWall(date: Date, days: number, minutes: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes() + minutes,
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

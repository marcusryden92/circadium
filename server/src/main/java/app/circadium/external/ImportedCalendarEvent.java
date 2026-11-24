package app.circadium.external;

/**
 * One materialized occurrence imported from an outside calendar, shaped exactly like an
 * {@code ExternalEvents} row: the id is the deterministic composite
 * {@code sourceId|uid|occurrenceStartISO}, {@code uid} is series-level for recurring events so one
 * per-event exception covers the whole series, and start/end are ISO-8601 instants with exactly
 * three fraction digits (the retired TS writers' {@code toISOString()} format, which keeps ids
 * written by both stacks identical).
 */
public record ImportedCalendarEvent(String id, String sourceId, String userId, String uid, String title,
        String start, String end, boolean allDay) {
}

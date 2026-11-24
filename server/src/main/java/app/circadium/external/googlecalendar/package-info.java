/**
 * Google Calendar read access on a user's offline OAuth grant: the calendar-import code flow's
 * token exchange and revoke, the calendar list, and windowed event fetches (occurrences
 * pre-expanded by {@code singleEvents=true}). The port of the web's
 * {@code utils/external-calendar/googleCalendarApi.ts}; the credentials are the same app
 * registration the sign-in flow uses ({@code circadium.oauth.google}).
 */
package app.circadium.external.googlecalendar;

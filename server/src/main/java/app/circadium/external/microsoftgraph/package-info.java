/**
 * Microsoft Graph calendar read access on a user's offline OAuth grant: the calendar-import code
 * flow's token exchange, the rotating refresh-token refresh, the calendar list, and windowed
 * calendarView fetches (occurrences pre-expanded). The port of the web's
 * {@code utils/external-calendar/microsoftGraphApi.ts}; the credentials are the same Entra app
 * registration the sign-in flow uses ({@code circadium.oauth.microsoft}). Microsoft documents no
 * revoke endpoint for consumer grants, so disconnect is a local delete.
 */
package app.circadium.external.microsoftgraph;

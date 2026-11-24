package app.circadium.external.ics;

/** Fetches an ICS feed's raw text. Content checks (VCALENDAR marker, size cap) are the caller's. */
public interface IcsFeedFetcher {

    String fetch(String url);
}

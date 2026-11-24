package app.circadium.external.ics;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Pattern;

/** The icsUrl.ts port: feed-URL normalization and Google sharing-link decoding. */
public final class IcsUrls {

    private static final Pattern HAS_SCHEME = Pattern.compile("^(https?|webcal)://", Pattern.CASE_INSENSITIVE);
    private static final Pattern WEBCAL = Pattern.compile("^webcal://", Pattern.CASE_INSENSITIVE);

    private IcsUrls() {
    }

    /**
     * Feed URLs are accepted as https:// or webcal:// (the subscription scheme Google, Outlook
     * and Apple hand out); webcal is plain https underneath. Returns null for anything that does
     * not parse as an http(s) URL.
     *
     * <p>The TS round-tripped through the WHATWG parser, whose serialization the UI and the
     * share-link detection depend on: scheme and host lowercase, default ports dropped, a bare
     * authority gaining the "/" path, spaces and WHATWG-encoded specials percent-encoded, and
     * path backslashes read as slashes. java.net.URI does none of that, so it is replicated
     * around the parse. Known residual deviation: non-ASCII hosts stay as typed (no punycode).
     */
    public static String normalize(String input) {
        if (input == null) {
            return null;
        }
        String trimmed = input.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String withScheme = HAS_SCHEME.matcher(trimmed).find() ? trimmed : "https://" + trimmed;
        String normalized = WEBCAL.matcher(withScheme).replaceFirst("https://");
        try {
            URI uri = new URI(encodeAfterAuthority(normalized));
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("https") && !scheme.equals("http")) {
                return null;
            }
            if (uri.getHost() == null) {
                return null;
            }
            StringBuilder result = new StringBuilder(scheme).append("://");
            if (uri.getRawUserInfo() != null) {
                result.append(uri.getRawUserInfo()).append('@');
            }
            result.append(uri.getHost().toLowerCase(Locale.ROOT));
            int port = uri.getPort();
            if (port != -1 && !(scheme.equals("https") && port == 443)
                    && !(scheme.equals("http") && port == 80)) {
                result.append(':').append(port);
            }
            String path = uri.getRawPath();
            result.append(path == null || path.isEmpty() ? "/" : path);
            if (uri.getRawQuery() != null) {
                result.append('?').append(uri.getRawQuery());
            }
            if (uri.getRawFragment() != null) {
                result.append('#').append(uri.getRawFragment());
            }
            return result.toString();
        } catch (URISyntaxException e) {
            return null;
        }
    }

    /**
     * A Google Calendar <em>sharing</em> link (calendar.google.com/calendar/u/0?cid=…) is an HTML
     * page, not a feed. The cid parameter is the base64url-encoded calendar id; decoding it lets
     * the add-flow try that calendar through a connected account or its public ICS feed, and name
     * the fix precisely when the calendar isn't public.
     */
    public static String googleShareLinkCalendarId(String url) {
        try {
            URI uri = new URI(url);
            if (!"calendar.google.com".equalsIgnoreCase(uri.getHost())) {
                return null;
            }
            if (uri.getPath() != null && uri.getPath().contains("/ical/")) {
                return null;
            }
            String cid = queryParam(uri.getRawQuery());
            if (cid == null) {
                return null;
            }
            String base64 = cid.replace('-', '+').replace('_', '/');
            String padded = base64 + "=".repeat((4 - base64.length() % 4) % 4);
            String decoded = new String(Base64.getDecoder().decode(padded), StandardCharsets.UTF_8);
            return decoded.contains("@") ? decoded : null;
        } catch (URISyntaxException | IllegalArgumentException e) {
            return null;
        }
    }

    public static String googlePublicIcsUrl(String calendarId) {
        return "https://calendar.google.com/calendar/ical/"
                + URLEncoder.encode(calendarId, StandardCharsets.UTF_8) + "/public/basic.ics";
    }

    /**
     * The WHATWG parser accepts characters java.net.URI refuses: spaces (pasted URLs pick them
     * up from email line wraps), the WHATWG path-encode specials, and path backslashes (read as
     * slashes in special URLs). A space in the authority stays fatal — no host can carry one,
     * and the TS rejected it too.
     */
    private static String encodeAfterAuthority(String url) {
        int authorityStart = url.indexOf("://") + 3;
        int pathStart = authorityStart;
        while (pathStart < url.length() && "/?#\\".indexOf(url.charAt(pathStart)) < 0) {
            pathStart++;
        }
        if (pathStart >= url.length()) {
            return url;
        }
        StringBuilder encoded = new StringBuilder(url.substring(0, pathStart));
        boolean inQuery = false;
        for (int i = pathStart; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '?' || c == '#') {
                inQuery = true;
            }
            if (c == '\\' && !inQuery) {
                encoded.append('/');
            } else if (" \"<>`{}|^\\".indexOf(c) >= 0) {
                encoded.append('%').append(String.format("%02X", (int) c));
            } else {
                encoded.append(c);
            }
        }
        return encoded.toString();
    }

    private static String queryParam(String rawQuery) {
        if (rawQuery == null) {
            return null;
        }
        for (String pair : rawQuery.split("&")) {
            if (pair.startsWith("cid=")) {
                String value = pair.substring(4);
                return value.isEmpty() ? null : URLDecoder.decode(value, StandardCharsets.UTF_8);
            }
        }
        return null;
    }
}

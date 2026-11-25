package app.circadium.external.mail;

/**
 * A rendered email. {@code kind} names the template for logs, which never carry the recipient or body.
 * {@code replyTo} is null for almost everything; the support notification sets it to the reporting user so
 * answering the notification answers the user.
 */
public record EmailMessage(String kind, String from, String to, String replyTo, String subject, String html,
        String text) {

    public EmailMessage(String kind, String from, String to, String subject, String html, String text) {
        this(kind, from, to, null, subject, html, text);
    }
}

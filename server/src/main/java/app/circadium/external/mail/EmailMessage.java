package app.circadium.external.mail;

/** A rendered email. {@code kind} names the template for logs, which never carry the recipient or body. */
public record EmailMessage(String kind, String from, String to, String subject, String html, String text) {}

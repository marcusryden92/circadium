package app.circadium.external.mail;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Renders the account emails. The layout and copy are ported from the web app's {@code lib/mail.ts} so both
 * senders produce the same mail, and the links open the web app's existing {@code /auth/*} pages.
 *
 * <p>The layout is table-based with every style inline: Outlook ignores most modern CSS and Gmail strips
 * {@code <style>} blocks. Any value not written in this file goes through {@link #escape} first.
 */
public class AccountEmails {

    private static final String PAPER = "#f2efea";
    private static final String INK = "#16142a";
    private static final String INK_SOFT = "#3c3a52";
    private static final String MUTED = "#7a7890";
    private static final String CARD = "#ffffff";
    private static final String RULE = "#eae5de";
    private static final String CARD_STROKE = "#e2ded7";
    private static final String FONT_DISPLAY = "'Clash Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";
    private static final String FONT_UI = "'Hubot Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "
            + "'Helvetica Neue', Arial, sans-serif";

    private static final String LAYOUT = withPalette("""
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <meta name="color-scheme" content="light">
            <meta name="supported-color-schemes" content="light">
            <title>Circadium</title>
            </head>
            <body style="margin:0;padding:0;background:{{paper}};font-family:{{fontUi}};color:{{inkSoft}};-webkit-font-smoothing:antialiased;">
            <div style="display:none;font-size:1px;color:{{paper}};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
            {{preheader}}
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{{paper}};padding:40px 16px;">
            <tr>
            <td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:{{card}};border-radius:16px;border:1px solid {{cardStroke}};overflow:hidden;">
            <tr>
            <td style="padding:32px 40px 22px;">
            <div style="font-family:{{fontDisplay}};font-size:22px;font-weight:500;letter-spacing:-0.03em;color:{{ink}};line-height:1;">Circadium</div>
            <div style="font-family:{{fontUi}};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:{{muted}};margin-top:8px;">{{eyebrow}}</div>
            </td>
            </tr>
            <tr>
            <td style="padding:0 40px;">
            <div style="height:1px;background:{{rule}};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
            </tr>
            <tr>
            <td style="padding:26px 40px 32px;">
            <h1 style="margin:0 0 14px;font-family:{{fontDisplay}};font-size:26px;font-weight:500;letter-spacing:-0.025em;color:{{ink}};line-height:1.15;">{{heading}}</h1>
            <div style="font-family:{{fontUi}};font-size:14.5px;line-height:1.6;color:{{inkSoft}};">{{body}}</div>
            {{cta}}
            </td>
            </tr>
            <tr>
            <td style="padding:0 40px;">
            <div style="height:1px;background:{{rule}};line-height:1px;font-size:0;">&nbsp;</div>
            </td>
            </tr>
            <tr>
            <td style="padding:18px 40px 26px;text-align:center;">
            <div style="font-family:{{fontUi}};font-size:11px;color:{{muted}};line-height:1.5;letter-spacing:0.02em;">The Circadium Team</div>
            </td>
            </tr>
            </table>
            <div style="font-family:{{fontUi}};font-size:10.5px;color:{{muted}};margin-top:16px;letter-spacing:0.04em;">circadium.app</div>
            </td>
            </tr>
            </table>
            </body>
            </html>
            """);

    private static final String CTA = withPalette("""
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
            <tr>
            <td style="background:{{ink}};border-radius:999px;">
            <a href="{{href}}" style="display:inline-block;padding:12px 22px;font-family:{{fontUi}};font-size:13px;font-weight:600;letter-spacing:0.01em;color:{{paper}};text-decoration:none;">{{label}}</a>
            </td>
            </tr>
            </table>
            """);

    private static final String PARAGRAPH = "<p style=\"margin:0 0 12px;\">%s</p>";
    private static final String FINE_PRINT = "<p style=\"margin:0;font-size:13px;color:" + MUTED + ";\">%s</p>";

    private final MailProperties properties;
    private final String webBaseUrl;

    public AccountEmails(MailProperties properties) {
        this.properties = properties;
        this.webBaseUrl = properties.webBaseUrl().replaceAll("/+$", "");
    }

    public EmailMessage verification(String email, String token) {
        String link = link("/auth/new-verification", token);
        return new EmailMessage("verification", properties.supportFrom(), email, "Confirm your email",
                render("Verify your email to finish signing up for Circadium", "Verify email", "Confirm your email",
                        PARAGRAPH.formatted("Welcome to Circadium. Confirm this email address to activate your account.")
                                + FINE_PRINT.formatted("If you didn&rsquo;t create an account, you can ignore this email."),
                        "Verify email", link),
                """
                Welcome to Circadium. Confirm this email address to activate your account:

                %s

                If you didn't create an account, you can ignore this email.
                """.formatted(link));
    }

    public EmailMessage twoFactorCode(String email, String code) {
        String codeBox = "<div style=\"margin:12px 0 4px;padding:18px 20px;background:" + PAPER + ";border:1px solid "
                + CARD_STROKE + ";border-radius:12px;text-align:center;\"><span style=\"font-family:" + FONT_DISPLAY
                + ";font-size:30px;font-weight:600;letter-spacing:0.32em;color:" + INK + ";\">" + escape(code)
                + "</span></div>";
        return new EmailMessage("two_factor", properties.securityFrom(), email, "Your Circadium two-factor code",
                render("Your Circadium two-factor code", "Security", "Your two-factor code",
                        "<p style=\"margin:0 0 16px;\">Use the code below to finish signing in. It expires in 5 minutes.</p>"
                                + codeBox
                                + "<p style=\"margin:20px 0 0;font-size:13px;color:" + MUTED
                                + ";\">If you didn&rsquo;t try to sign in, you can ignore this email.</p>",
                        null, null),
                """
                Use this code to finish signing in to Circadium. It expires in 5 minutes.

                %s

                If you didn't try to sign in, you can ignore this email.
                """.formatted(code));
    }

    public EmailMessage passwordReset(String email, String token) {
        String link = link("/auth/new-password", token);
        return new EmailMessage("password_reset", properties.supportFrom(), email, "Reset your password",
                render("Reset your Circadium password", "Security", "Reset your password",
                        PARAGRAPH.formatted("Click below to choose a new password for your Circadium account. "
                                + "The link expires in 1 hour.")
                                + FINE_PRINT.formatted("If you didn&rsquo;t request a reset, you can ignore this email "
                                        + "or contact support."),
                        "Reset password", link),
                """
                Choose a new password for your Circadium account (the link expires in 1 hour):

                %s

                If you didn't request a reset, you can ignore this email or contact support.
                """.formatted(link));
    }

    public EmailMessage passwordChanged(String email) {
        String resetLink = webBaseUrl + "/auth/reset";
        return new EmailMessage("password_changed", properties.securityFrom(), email,
                "Your Circadium password was changed",
                render("Your Circadium password was changed", "Security", "Your password was changed",
                        PARAGRAPH.formatted("The password for your Circadium account was just changed, and every "
                                + "device was signed out.")
                                + FINE_PRINT.formatted("If this wasn&rsquo;t you, reset your password right away and "
                                        + "contact support@circadium.app."),
                        "Reset password", resetLink),
                """
                The password for your Circadium account was just changed, and every device was signed out.

                If this wasn't you, reset your password right away and contact support@circadium.app:

                %s
                """.formatted(resetLink));
    }

    public EmailMessage accountDeletion(String email, String token) {
        String link = link("/auth/confirm-deletion", token);
        return new EmailMessage("account_deletion", properties.securityFrom(), email, "Confirm account deletion",
                render("Confirm permanent Circadium account deletion", "Account deletion", "Confirm account deletion",
                        PARAGRAPH.formatted("You asked to permanently delete your Circadium account. This will erase "
                                + "every planner, category, location, template, and calendar event tied to it. "
                                + "There is no undo.")
                                + PARAGRAPH.formatted("If you want to proceed, confirm below within "
                                        + "<strong>30 minutes</strong>.")
                                + FINE_PRINT.formatted("If you didn&rsquo;t request this, ignore this email &mdash; "
                                        + "your account will stay untouched."),
                        "Confirm deletion", link),
                """
                You asked to permanently delete your Circadium account. This will erase every planner, category, \
                location, template, and calendar event tied to it. There is no undo.

                If you want to proceed, confirm within 30 minutes:

                %s

                If you didn't request this, ignore this email; your account will stay untouched.
                """.formatted(link));
    }

    public EmailMessage existingAccount(String email, boolean hasPassword) {
        String loginLink = webBaseUrl + "/auth/login";
        String resetLink = webBaseUrl + "/auth/reset";
        String howToSignIn = hasPassword
                ? "Sign in with your password, or reset it if you&rsquo;ve forgotten it."
                : "Sign in with the Google or GitHub account you used to sign up.";
        return new EmailMessage("existing_account", properties.supportFrom(), email,
                "You already have a Circadium account",
                render("You already have a Circadium account", "Account", "You already have an account",
                        PARAGRAPH.formatted("Someone, hopefully you, tried to create a Circadium account with this "
                                + "email address. There is already an account for it.")
                                + PARAGRAPH.formatted(howToSignIn)
                                + FINE_PRINT.formatted("If this wasn&rsquo;t you, you can ignore this email. "
                                        + "Nothing about your account has changed."),
                        "Sign in", loginLink),
                ("""
                Someone, hopefully you, tried to create a Circadium account with this email address. There is \
                already an account for it.

                Sign in: %s
                """ + (hasPassword ? "Forgot your password? %s%n" : "Use the Google or GitHub account you signed up with.%n")
                        + """

                If this wasn't you, you can ignore this email. Nothing about your account has changed.
                """).formatted(loginLink, resetLink));
    }

    private String link(String path, String token) {
        return webBaseUrl + path + "?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
    }

    private static String render(String preheader, String eyebrow, String heading, String bodyHtml,
            String ctaLabel, String ctaHref) {
        String cta = ctaLabel == null ? "" : CTA.replace("{{href}}", escape(ctaHref)).replace("{{label}}", ctaLabel);
        return LAYOUT
                .replace("{{preheader}}", preheader)
                .replace("{{eyebrow}}", eyebrow)
                .replace("{{heading}}", heading)
                .replace("{{cta}}", cta)
                .replace("{{body}}", bodyHtml);
    }

    private static String withPalette(String template) {
        String result = template;
        for (Map.Entry<String, String> entry : Map.of(
                "{{paper}}", PAPER, "{{ink}}", INK, "{{inkSoft}}", INK_SOFT, "{{muted}}", MUTED, "{{card}}", CARD,
                "{{rule}}", RULE, "{{cardStroke}}", CARD_STROKE, "{{fontDisplay}}", FONT_DISPLAY,
                "{{fontUi}}", FONT_UI).entrySet()) {
            result = result.replace(entry.getKey(), entry.getValue());
        }
        return result;
    }

    static String escape(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}

package app.circadium.external.mail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AccountEmailsTest {

    private final AccountEmails emails = new AccountEmails(new MailProperties(null, "https://api.resend.test",
            "https://app.example.com//", "security@circadium.app", "no-reply@circadium.app",
            "support@circadium.app", true));

    @Test
    void linksPointAtTheWebAppWithAnEncodedToken() {
        EmailMessage message = emails.accountDeletion("user@example.com", "a b&c");

        assertThat(message.from()).isEqualTo("security@circadium.app");
        assertThat(message.text()).contains("https://app.example.com/auth/confirm-deletion?token=a+b%26c");
        assertThat(message.html()).contains("href=\"https://app.example.com/auth/confirm-deletion?token=a+b%26c\"");
    }

    @Test
    void everyPlaceholderIsFilled() {
        for (EmailMessage message : new EmailMessage[] {
                emails.verification("user@example.com", "token"),
                emails.twoFactorCode("user@example.com", "123456"),
                emails.passwordReset("user@example.com", "token"),
                emails.passwordChanged("user@example.com"),
                emails.accountDeletion("user@example.com", "token"),
                emails.existingAccount("user@example.com", true),
                emails.existingAccount("user@example.com", false),
                emails.emailChangeVerification("new@example.com", "token"),
                emails.emailChangeRequested("user@example.com", "new@example.com"),
                emails.emailChanged("user@example.com", "new@example.com"),
                emails.twoFactorChanged("user@example.com", true),
                emails.twoFactorChanged("user@example.com", false)}) {
            assertThat(message.html()).doesNotContain("{{").contains("<!DOCTYPE html>");
            assertThat(message.text()).doesNotContain("%s").isNotBlank();
        }
    }

    /** The new address is typed by whoever holds the session, so it is escaped like any other outside value. */
    @Test
    void emailChangeNoticesGoToTheOldAddressAndEscapeTheNewOne() {
        String hostile = "<b>x</b>@example.com";

        EmailMessage requested = emails.emailChangeRequested("user@example.com", hostile);
        EmailMessage changed = emails.emailChanged("user@example.com", hostile);

        assertThat(requested.to()).isEqualTo("user@example.com");
        assertThat(requested.html()).contains("&lt;b&gt;x&lt;/b&gt;@example.com").doesNotContain("<b>x</b>");
        assertThat(requested.text()).contains("https://app.example.com/auth/reset");
        assertThat(changed.html()).contains("&lt;b&gt;x&lt;/b&gt;@example.com").doesNotContain("<b>x</b>");
        assertThat(emails.emailChangeVerification("new@example.com", "t").text())
                .contains("https://app.example.com/auth/new-verification?token=t");
    }

    @Test
    void existingAccountNoticePointsOAuthUsersAtTheirProvider() {
        assertThat(emails.existingAccount("user@example.com", true).text()).contains("/auth/reset");
        assertThat(emails.existingAccount("user@example.com", false).text())
                .doesNotContain("/auth/reset")
                .contains("Google, Microsoft or Apple account");
    }

    @Test
    void oauthSignupConfirmationLinksToTheConfirmPageAndNamesTheProvider() {
        EmailMessage message = emails.oauthSignupConfirmation("user@example.com", "tok_en-123", "Microsoft");

        assertThat(message.text())
                .contains("/auth/oauth/confirm?token=tok_en-123")
                .contains("with a Microsoft account")
                .contains("sign in with Microsoft again");
        assertThat(message.html()).contains("/auth/oauth/confirm?token=tok_en-123");
    }

    @Test
    void escapesMarkupInInterpolatedValues() {
        assertThat(AccountEmails.escape("<a href=\"x\">'&'</a>"))
                .isEqualTo("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    }
}

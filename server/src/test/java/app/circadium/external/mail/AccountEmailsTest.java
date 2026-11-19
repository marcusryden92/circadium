package app.circadium.external.mail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AccountEmailsTest {

    private final AccountEmails emails = new AccountEmails(new MailProperties(null, "https://api.resend.test",
            "https://app.example.com//", "security@circadium.app", "support@circadium.app", true));

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
                emails.existingAccount("user@example.com", false)}) {
            assertThat(message.html()).doesNotContain("{{").contains("<!DOCTYPE html>");
            assertThat(message.text()).doesNotContain("%s").isNotBlank();
        }
    }

    @Test
    void existingAccountNoticePointsOAuthUsersAtTheirProvider() {
        assertThat(emails.existingAccount("user@example.com", true).text()).contains("/auth/reset");
        assertThat(emails.existingAccount("user@example.com", false).text())
                .doesNotContain("/auth/reset")
                .contains("Google account");
    }

    @Test
    void escapesMarkupInInterpolatedValues() {
        assertThat(AccountEmails.escape("<a href=\"x\">'&'</a>"))
                .isEqualTo("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    }
}

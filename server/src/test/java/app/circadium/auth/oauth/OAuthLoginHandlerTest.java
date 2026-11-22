package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class OAuthLoginHandlerTest {

    @Test
    void providerDescriptionsReachTheLogWithoutEmails() {
        assertThat(OAuthLoginHandler.loggableDescription(
                "AADSTS50020: User account 'ada.l@example.com' from identity provider 'live.com' does not exist"))
                .isEqualTo("AADSTS50020: User account '<email>' from identity provider 'live.com' does not exist");
        assertThat(OAuthLoginHandler.loggableDescription("first\nsecond")).isEqualTo("first second");
        assertThat(OAuthLoginHandler.loggableDescription(null)).isEqualTo("no description");
        assertThat(OAuthLoginHandler.loggableDescription("x".repeat(800))).hasSize(503);
    }
}

package app.circadium.auth.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationExchange;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationResponse;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** Through Spring's real token client, with the token endpoint mocked. */
class TokenErrorResponseHandlerTest {

    private static final String TOKEN_URI = "https://login.test/token";
    private static final String REDIRECT_URI = "https://api.test/login/oauth2/code/microsoft";
    private static final String AADSTS_ERROR = """
            {"error":"invalid_grant","error_description":"AADSTS50148: The code_verifier does not match.",\
            "error_codes":[50148],"timestamp":"2026-11-22 02:15:58Z"}""";

    private MockRestServiceServer server;
    private RestClientAuthorizationCodeTokenResponseClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new RestClientAuthorizationCodeTokenResponseClient();
        client.setRestClient(OAuthClientConfig.tokenRestClient(builder));
    }

    @Test
    void theBodysErrorWinsOverAWwwAuthenticateHeaderSpringCannotRead() {
        server.expect(requestTo(TOKEN_URI)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"login.test\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(AADSTS_ERROR));

        OAuth2Error error = tokenRequestError();

        assertThat(error.getErrorCode()).isEqualTo("invalid_grant");
        assertThat(error.getDescription()).startsWith("AADSTS50148");
    }

    @Test
    void aRefusedClientIsReportedByItsOAuthError() {
        server.expect(requestTo(TOKEN_URI)).andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_JSON)
                .body("""
                        {"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided."}"""));

        OAuth2Error error = tokenRequestError();

        assertThat(error.getErrorCode()).isEqualTo("invalid_client");
        assertThat(error.getDescription()).startsWith("AADSTS7000215");
    }

    @Test
    void aBodyThatIsNotAnOAuthErrorGetsSpringsHandling() {
        server.expect(requestTo(TOKEN_URI)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"login.test\"")
                .contentType(MediaType.TEXT_HTML)
                .body("<html>Bad Request</html>"));

        assertThat(tokenRequestError().getErrorCode()).isEqualTo("server_error");
    }

    @Test
    void aSuccessfulResponseStillReadsAsATokenResponse() {
        server.expect(requestTo(TOKEN_URI)).andRespond(withSuccess("""
                {"access_token":"access-1","token_type":"Bearer","expires_in":3600,"id_token":"id-1"}""",
                MediaType.APPLICATION_JSON));

        var response = client.getTokenResponse(grantRequest());

        assertThat(response.getAccessToken().getTokenValue()).isEqualTo("access-1");
        assertThat(response.getAdditionalParameters()).containsEntry("id_token", "id-1");
    }

    private OAuth2Error tokenRequestError() {
        OAuth2AuthorizationException thrown =
                catchThrowableOfType(OAuth2AuthorizationException.class, () -> client.getTokenResponse(grantRequest()));
        server.verify();
        return thrown.getError();
    }

    private static OAuth2AuthorizationCodeGrantRequest grantRequest() {
        ClientRegistration registration = ClientRegistration.withRegistrationId("microsoft")
                .clientId("client-1")
                .clientSecret("secret-1")
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(REDIRECT_URI)
                .authorizationUri("https://login.test/authorize")
                .tokenUri(TOKEN_URI)
                .build();
        OAuth2AuthorizationRequest request = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://login.test/authorize")
                .clientId("client-1")
                .redirectUri(REDIRECT_URI)
                .state("state-1")
                .build();
        OAuth2AuthorizationResponse response = OAuth2AuthorizationResponse.success("code-1")
                .redirectUri(REDIRECT_URI)
                .state("state-1")
                .build();
        return new OAuth2AuthorizationCodeGrantRequest(registration, new OAuth2AuthorizationExchange(request, response));
    }
}

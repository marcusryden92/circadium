package app.circadium.auth.oauth;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.oauth2.client.http.OAuth2ErrorResponseErrorHandler;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.http.converter.OAuth2ErrorHttpMessageConverter;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.ResponseErrorHandler;

/**
 * Reads a failed token request's error from the response body before anything else. Spring's own handler looks at
 * the {@code WWW-Authenticate} header first whenever there is one, and a header it cannot parse as a Bearer error
 * becomes a bare {@code server_error} with no description, so Microsoft's reason ({@code AADSTS...}), which is only
 * in the JSON body, never reached the log. It also reports a 401 by its OAuth error ({@code invalid_client} and the
 * provider's description) instead of a generic {@code invalid_token_response}. A body that is not an OAuth error goes
 * to Spring's handler unchanged.
 */
final class TokenErrorResponseHandler implements ResponseErrorHandler {

    private final HttpMessageConverter<OAuth2Error> errorConverter = new OAuth2ErrorHttpMessageConverter();
    private final ResponseErrorHandler springHandler = new OAuth2ErrorResponseErrorHandler();

    @Override
    public boolean hasError(ClientHttpResponse response) throws IOException {
        return springHandler.hasError(response);
    }

    @Override
    public void handleError(URI url, HttpMethod method, ClientHttpResponse response) throws IOException {
        ClientHttpResponse buffered = new BufferedResponse(response, StreamUtils.copyToByteArray(response.getBody()));
        OAuth2Error error = readError(buffered);
        if (error != null) {
            throw new OAuth2AuthorizationException(error);
        }
        springHandler.handleError(url, method, buffered);
    }

    private OAuth2Error readError(ClientHttpResponse response) throws IOException {
        try {
            return errorConverter.read(OAuth2Error.class, response);
        } catch (HttpMessageNotReadableException e) {
            return null;
        }
    }

    /** The body can be read once, and the fallback needs it again after the attempt above. */
    private record BufferedResponse(ClientHttpResponse response, byte[] body) implements ClientHttpResponse {

        @Override
        public HttpStatusCode getStatusCode() throws IOException {
            return response.getStatusCode();
        }

        @Override
        public String getStatusText() throws IOException {
            return response.getStatusText();
        }

        @Override
        public HttpHeaders getHeaders() {
            return response.getHeaders();
        }

        @Override
        public InputStream getBody() {
            return new ByteArrayInputStream(body);
        }

        @Override
        public void close() {
            response.close();
        }
    }
}

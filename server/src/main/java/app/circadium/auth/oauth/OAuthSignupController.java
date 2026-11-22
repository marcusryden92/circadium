package app.circadium.auth.oauth;

import app.circadium.auth.ClientInfo;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class OAuthSignupController {

    private final OAuthAccountService accountService;

    /**
     * Opens the link mailed for a first sign-in through a provider that does not vouch for the email: the account
     * is created, nobody is signed in, and the response names the provider to sign in with next. A POST, never a
     * GET, so a mail client or scanner fetching the link cannot create the account; the web page posts only when
     * the person presses its button.
     */
    @PostMapping("/auth/oauth/confirm")
    public ConfirmResponse confirm(@Valid @RequestBody ConfirmRequest request, HttpServletRequest httpRequest) {
        SignInProvider provider = accountService.confirmSignup(request.token(), ClientInfo.from(httpRequest));
        return new ConfirmResponse(provider.registrationId());
    }

    /** @param token the link's token, 32 random bytes in base64url */
    public record ConfirmRequest(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token) {}

    /** @param provider the registration id to sign in with ({@code microsoft}) */
    public record ConfirmResponse(String provider) {}
}

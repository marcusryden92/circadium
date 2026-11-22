package app.circadium.auth.oauth;

import app.circadium.auth.AccountFlowException;
import app.circadium.auth.AuditEvent;
import app.circadium.auth.AuditLogger;
import app.circadium.auth.ClientInfo;
import app.circadium.auth.CredentialsAuthService;
import app.circadium.auth.oauth.OAuthPendingSignups.Taken;
import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.OAuthPendingSignup;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AccountRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * Matches a provider-verified identity to a Circadium account the way NextAuth's Prisma adapter did, so accounts
 * created through the web app's Google sign-in keep working: an existing {@code accounts} row for
 * (provider, subject) signs its user in.
 *
 * <p>A first sign-in creates an account only for an email the provider vouches for (Google's and Apple's
 * {@code email_verified}). Any other address (every Microsoft one) gets an emailed link instead, and the account
 * exists only once the address's owner opens it. Otherwise someone could create an account under another
 * person's address through the provider; when the real owner later reset the password through the emailed link,
 * the other person's provider login would still be attached.
 *
 * <p>An email that already belongs to an account is refused, not linked (NextAuth's OAuthAccountNotLinked).
 * Linking by email would let someone who registered the address with a password before its owner ever used the
 * provider keep that password on the owner's account once the provider vouches for the address. For an address the
 * provider does not vouch for, the refusal goes to the address by mail rather than to the browser, which would
 * otherwise learn whether any address it names has an account.
 *
 * <p>Provider tokens are not stored, with one exception: Apple's refresh token, the only handle Apple accepts for
 * revoking the app's access when the account is deleted, which App Store review requires. It grants nothing
 * without the client secret, which only this server can sign. Calendar access has its own grant.
 */
@Service
@RequiredArgsConstructor
public class OAuthAccountService {

    static final String ACCOUNT_EXISTS = "account_exists";
    static final String EMAIL_MISSING = "email_missing";
    static final String EMAIL_IN_USE = "email_in_use";

    /** NextAuth's value for OpenID Connect providers, kept so rows from both apps look alike. */
    private static final String ACCOUNT_TYPE = "oidc";

    private final AccountRepository accountRepository;
    private final UserRepository userRepository;
    private final OAuthPendingSignups pendingSignups;
    private final AccountMailer accountMailer;
    private final TransactionTemplate transactionTemplate;
    private final AuditLogger auditLogger;
    private final Clock clock;

    /**
     * @param subject the provider's stable user id; emails can change, this cannot
     * @param refreshToken Apple's refresh token, null for every other provider
     */
    public record ProviderIdentity(String provider, String subject, String email, boolean emailVerified, String name,
            String picture, String refreshToken) {}

    public sealed interface SignInResult {
        record SignedIn(User user) implements SignInResult {}

        /** The provider does not vouch for the email; the next step is in a mail to that address. */
        record VerificationSent() implements SignInResult {}

        /** @param reason {@link #ACCOUNT_EXISTS} or {@link #EMAIL_MISSING}, passed on to the client as-is */
        record Refused(String reason) implements SignInResult {}
    }

    public SignInResult signIn(ProviderIdentity identity, ClientInfo client) {
        Optional<Account> account =
                accountRepository.findByProviderAndProviderAccountId(identity.provider(), identity.subject());
        Optional<User> linked = account.flatMap(row -> userRepository.findById(row.getUserId()));
        if (linked.isPresent()) {
            if (identity.refreshToken() != null) {
                accountRepository.updateRefreshToken(account.get().getId(), identity.refreshToken());
            }
            return new SignInResult.SignedIn(linked.get());
        }
        if (!StringUtils.hasText(identity.email())) {
            return refuse(null, null, client, EMAIL_MISSING);
        }
        String email = CredentialsAuthService.normalize(identity.email());
        Optional<User> owner = userRepository.findFirstByEmailIgnoreCase(email);
        if (!identity.emailVerified()) {
            return sendVerification(identity, email, owner, client);
        }
        if (owner.isPresent()) {
            return refuse(owner.get().getId(), email, client, ACCOUNT_EXISTS);
        }

        User user;
        try {
            user = transactionTemplate.execute(status -> createUser(identity, email));
        } catch (DataIntegrityViolationException concurrentFirstSignIn) {
            return accountRepository.findByProviderAndProviderAccountId(identity.provider(), identity.subject())
                    .flatMap(row -> userRepository.findById(row.getUserId()))
                    .<SignInResult>map(SignInResult.SignedIn::new)
                    .orElseGet(() -> refuse(null, email, client, ACCOUNT_EXISTS));
        }
        auditLogger.record(AuditEvent.OAUTH_REGISTER, user.getId(), email, client, identity.provider());
        return new SignInResult.SignedIn(user);
    }

    /**
     * Mails the address a link that creates the account, or, when the address already has an account, a notice
     * telling its owner how they sign in. The browser sees the same outcome either way.
     */
    private SignInResult sendVerification(ProviderIdentity identity, String email, Optional<User> owner,
            ClientInfo client) {
        if (owner.isPresent()) {
            accountMailer.sendExistingAccountNotice(owner.get().getEmail(), owner.get().getPassword() != null);
            auditLogger.record(AuditEvent.OAUTH_REFUSED, owner.get().getId(), email, client, ACCOUNT_EXISTS);
            return new SignInResult.VerificationSent();
        }
        String provider = providerName(identity.provider());
        Optional<String> token = pendingSignups.issue(identity, email);
        token.ifPresent(value -> accountMailer.sendOAuthSignupConfirmation(email, value, provider));
        auditLogger.record(AuditEvent.OAUTH_SIGNUP_PENDING, null, email, client,
                token.isPresent() ? identity.provider() : identity.provider() + " resend_cooldown");
        return new SignInResult.VerificationSent();
    }

    private sealed interface Confirmation {
        record Created(User user, OAuthPendingSignup signup) implements Confirmation {}

        record Rejected(String reason) implements Confirmation {}

        record EmailInUse(OAuthPendingSignup signup) implements Confirmation {}
    }

    /**
     * Opens the emailed link: creates the account the pending sign-up describes and returns its provider, so the
     * page can offer to sign in with it. It does not sign anyone in. The link proves the address, not the
     * provider login, so the account only becomes usable through a sign-in with that provider account; whoever
     * opens the link (a mail scanner, or the owner of an address someone else typed at the provider) gets nothing
     * they could use.
     *
     * <p>The audit row is written after the commit, because it references the user row created inside it.
     */
    public SignInProvider confirmSignup(String token, ClientInfo client) {
        Confirmation confirmation;
        try {
            confirmation = transactionTemplate.execute(status -> confirm(token));
        } catch (DataIntegrityViolationException concurrentClaim) {
            auditLogger.record(AuditEvent.OAUTH_SIGNUP_LINK_FAILURE, null, null, client, EMAIL_IN_USE);
            throw emailInUse();
        }
        return switch (confirmation) {
            case Confirmation.Created created -> {
                auditLogger.record(AuditEvent.OAUTH_REGISTER, created.user().getId(), created.signup().getEmail(),
                        client, created.signup().getProvider() + " email_link");
                yield SignInProvider.fromRegistrationId(created.signup().getProvider()).orElseThrow();
            }
            case Confirmation.EmailInUse inUse -> {
                auditLogger.record(AuditEvent.OAUTH_SIGNUP_LINK_FAILURE, null, inUse.signup().getEmail(), client,
                        EMAIL_IN_USE);
                throw emailInUse();
            }
            case Confirmation.Rejected rejected -> {
                auditLogger.record(AuditEvent.OAUTH_SIGNUP_LINK_FAILURE, null, null, client, rejected.reason());
                throw OAuthPendingSignups.EXPIRED_LINK.equals(rejected.reason())
                        ? AccountFlowException.expiredLink()
                        : AccountFlowException.invalidLink();
            }
        };
    }

    private Confirmation confirm(String token) {
        Taken taken = pendingSignups.take(token);
        if (taken instanceof Taken.Rejected rejected) {
            return new Confirmation.Rejected(rejected.reason());
        }
        OAuthPendingSignup signup = ((Taken.Found) taken).signup();
        if (userRepository.findFirstByEmailIgnoreCase(signup.getEmail()).isPresent()) {
            return new Confirmation.EmailInUse(signup);
        }
        ProviderIdentity identity = new ProviderIdentity(signup.getProvider(), signup.getSubject(), signup.getEmail(),
                true, signup.getName(), signup.getImage(), null);
        return new Confirmation.Created(createUser(identity, signup.getEmail()), signup);
    }

    private User createUser(ProviderIdentity identity, String email) {
        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName(StringUtils.hasText(identity.name()) ? identity.name().trim() : null);
        user.setEmail(email);
        user.setEmailVerified(DbTime.now(clock));
        user.setImage(identity.picture());
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        userRepository.saveAndFlush(user);

        Account account = new Account();
        account.setId(UUID.randomUUID().toString());
        account.setUserId(user.getId());
        account.setType(ACCOUNT_TYPE);
        account.setProvider(identity.provider());
        account.setProviderAccountId(identity.subject());
        account.setRefreshToken(identity.refreshToken());
        accountRepository.saveAndFlush(account);
        return user;
    }

    private SignInResult refuse(String userId, String email, ClientInfo client, String reason) {
        auditLogger.record(AuditEvent.OAUTH_REFUSED, userId, email, client, reason);
        return new SignInResult.Refused(reason);
    }

    private static String providerName(String registrationId) {
        return SignInProvider.fromRegistrationId(registrationId).map(SignInProvider::displayName).orElse(registrationId);
    }

    private static AccountFlowException emailInUse() {
        return new AccountFlowException(HttpStatus.CONFLICT, EMAIL_IN_USE,
                "This email address already has a Circadium account. Sign in to that account instead.");
    }
}

package app.circadium.auth.oauth;

import app.circadium.auth.AuditEvent;
import app.circadium.auth.AuditLogger;
import app.circadium.auth.ClientInfo;
import app.circadium.auth.CredentialsAuthService;
import app.circadium.persistence.DbTime;
import app.circadium.persistence.entity.Account;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.AccountRepository;
import app.circadium.persistence.repository.UserRepository;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

/**
 * Matches a provider-verified identity to a Circadium account the way NextAuth's Prisma adapter did, so accounts
 * created through the web app's Google sign-in keep working: an existing {@code accounts} row for
 * (provider, subject) signs its user in; otherwise a new user is created with the email already verified.
 *
 * <p>An email that already belongs to an account is refused, not linked (NextAuth's OAuthAccountNotLinked).
 * Linking by email would let someone who registered the address with a password before its owner ever used
 * Google keep that password on the owner's account once Google vouches for the address.
 *
 * <p>Provider tokens are not stored: signing in only needs the identity, and calendar access has its own grant.
 */
@Service
@RequiredArgsConstructor
public class OAuthAccountService {

    static final String ACCOUNT_EXISTS = "account_exists";
    static final String EMAIL_UNVERIFIED = "email_unverified";

    /** NextAuth's value for OpenID Connect providers, kept so rows from both apps look alike. */
    private static final String ACCOUNT_TYPE = "oidc";

    private final AccountRepository accountRepository;
    private final UserRepository userRepository;
    private final TransactionTemplate transactionTemplate;
    private final AuditLogger auditLogger;
    private final Clock clock;

    /** @param subject the provider's stable user id ({@code sub}); emails can change, this cannot */
    public record ProviderIdentity(
            String provider, String subject, String email, boolean emailVerified, String name, String picture) {}

    public sealed interface SignInResult {
        record SignedIn(User user) implements SignInResult {}

        /** @param reason {@link #ACCOUNT_EXISTS} or {@link #EMAIL_UNVERIFIED}, passed on to the client as-is */
        record Refused(String reason) implements SignInResult {}
    }

    public SignInResult signIn(ProviderIdentity identity, ClientInfo client) {
        Optional<User> linked = linkedUser(identity);
        if (linked.isPresent()) {
            return new SignInResult.SignedIn(linked.get());
        }
        if (!identity.emailVerified() || !StringUtils.hasText(identity.email())) {
            return refuse(null, null, client, EMAIL_UNVERIFIED);
        }
        String email = CredentialsAuthService.normalize(identity.email());
        Optional<User> owner = userRepository.findFirstByEmailIgnoreCase(email);
        if (owner.isPresent()) {
            return refuse(owner.get().getId(), email, client, ACCOUNT_EXISTS);
        }

        User user;
        try {
            user = transactionTemplate.execute(status -> createUser(identity, email));
        } catch (DataIntegrityViolationException concurrentFirstSignIn) {
            return linkedUser(identity)
                    .<SignInResult>map(SignInResult.SignedIn::new)
                    .orElseGet(() -> refuse(null, email, client, ACCOUNT_EXISTS));
        }
        auditLogger.record(AuditEvent.OAUTH_REGISTER, user.getId(), email, client, identity.provider());
        return new SignInResult.SignedIn(user);
    }

    private Optional<User> linkedUser(ProviderIdentity identity) {
        return accountRepository.findByProviderAndProviderAccountId(identity.provider(), identity.subject())
                .flatMap(account -> userRepository.findById(account.getUserId()));
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
        accountRepository.saveAndFlush(account);
        return user;
    }

    private SignInResult refuse(String userId, String email, ClientInfo client, String reason) {
        auditLogger.record(AuditEvent.OAUTH_REFUSED, userId, email, client, reason);
        return new SignInResult.Refused(reason);
    }
}

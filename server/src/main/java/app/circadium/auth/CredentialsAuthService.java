package app.circadium.auth;

import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.ErrorResponseException;

/**
 * Email + password login, registration, and the emailed 2FA step-up, ported from the web app's
 * {@code actions/login.ts} and {@code actions/register.ts}.
 *
 * <p>The order of checks matters: lockout first (no password work while locked), then the password, and only
 * then verification and 2FA. Checking the password before anything that sends mail means nobody can trigger
 * 2FA or verification emails, or probe 2FA codes, without knowing the password.
 *
 * <p>Deliberately not {@code @Transactional}: each step commits on its own so failure counters and audit rows
 * survive the exception that ends a failed attempt.
 */
@Slf4j
@Service
public class CredentialsAuthService {

    /** bcrypt only reads the first 72 bytes; longer passwords would silently share a hash. */
    static final int MAX_PASSWORD_BYTES = 72;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final LoginThrottle loginThrottle;
    private final AccountTokens accountTokens;
    private final AccountMailer accountMailer;
    private final TokenService tokenService;
    private final AuditLogger auditLogger;

    /** Checked against when the account does not exist, so that path costs the same time as a real check. */
    private final String timingDummyHash;

    public CredentialsAuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,
            LoginThrottle loginThrottle, AccountTokens accountTokens, AccountMailer accountMailer,
            TokenService tokenService, AuditLogger auditLogger) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.loginThrottle = loginThrottle;
        this.accountTokens = accountTokens;
        this.accountMailer = accountMailer;
        this.tokenService = tokenService;
        this.auditLogger = auditLogger;
        this.timingDummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public sealed interface LoginOutcome {
        record Authenticated(IssuedTokens tokens) implements LoginOutcome {}

        record TwoFactorRequired() implements LoginOutcome {}

        record EmailVerificationSent() implements LoginOutcome {}
    }

    /** First step. With 2FA enabled this emails a code instead of signing in. */
    public LoginOutcome login(String email, String password, ClientInfo client) {
        User user = authenticate(email, password, client);
        if (user.getEmailVerified() == null) {
            return resendVerification(user, client);
        }
        if (user.isTwoFactorEnabled()) {
            String code = accountTokens.issueTwoFactorCode(user.getEmail());
            accountMailer.sendTwoFactorCode(user.getEmail(), code);
            auditLogger.record(AuditEvent.TWO_FACTOR_CHALLENGE, user.getId(), normalize(user.getEmail()), client, null);
            return new LoginOutcome.TwoFactorRequired();
        }
        return completeLogin(user, client);
    }

    /**
     * Second step. The password is checked again so the 6-digit code is never the only thing standing
     * between a guesser and the account, and a wrong code counts toward the same lockout as a wrong password.
     */
    public LoginOutcome verifyTwoFactor(String email, String password, String code, ClientInfo client) {
        User user = authenticate(email, password, client);
        if (user.getEmailVerified() == null) {
            return resendVerification(user, client);
        }
        if (user.isTwoFactorEnabled() && !accountTokens.consumeTwoFactorCode(user.getEmail(), code)) {
            throw failure(normalize(email), user, client, "bad_two_factor_code");
        }
        return completeLogin(user, client);
    }

    /**
     * Answers identically whether or not the email is taken, so registration cannot be used to discover
     * which accounts exist; an existing owner is only recorded in the audit log.
     */
    public void register(String name, String email, String password, ClientInfo client) {
        String normalizedEmail = normalize(email);
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new ErrorResponseException(HttpStatus.BAD_REQUEST, ProblemDetail.forStatusAndDetail(
                    HttpStatus.BAD_REQUEST, "Password must be at most 72 bytes."), null);
        }

        Optional<User> existing = userRepository.findFirstByEmailIgnoreCase(normalizedEmail);
        if (existing.isPresent()) {
            auditLogger.record(AuditEvent.REGISTER_DUPLICATE, existing.get().getId(), normalizedEmail, client, null);
            return;
        }

        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setName(name.trim());
        user.setEmail(normalizedEmail);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole(UserRole.USER);
        user.setTwoFactorEnabled(false);
        user.setDataVersion(0);
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException concurrentRegistration) {
            auditLogger.record(AuditEvent.REGISTER_DUPLICATE, null, normalizedEmail, client, "concurrent");
            return;
        }

        String token = accountTokens.issueVerificationToken(normalizedEmail);
        accountMailer.sendVerificationEmail(normalizedEmail, token);
        auditLogger.record(AuditEvent.REGISTER, user.getId(), normalizedEmail, client, null);
    }

    /** Lockout check, account lookup, and password check, shared by both login steps. */
    private User authenticate(String email, String password, ClientInfo client) {
        String key = normalize(email);

        Optional<Duration> lock = loginThrottle.remainingLock(key);
        if (lock.isPresent()) {
            auditLogger.record(AuditEvent.LOGIN_BLOCKED, null, key, client, null);
            throw new TooManyAttemptsException(lock.get());
        }

        Optional<User> found = userRepository.findFirstByEmailIgnoreCase(key)
                .filter(user -> user.getPassword() != null);
        if (found.isEmpty()) {
            passwordEncoder.matches(password, timingDummyHash);
            throw failure(key, null, client, "unknown_account");
        }
        User user = found.get();
        if (!passwordMatches(password, user.getPassword())) {
            throw failure(key, user, client, "bad_password");
        }
        return user;
    }

    /** The password was right, so the attempt counts as a success for lockout purposes. */
    private LoginOutcome resendVerification(User user, ClientInfo client) {
        loginThrottle.recordSuccess(normalize(user.getEmail()));
        String token = accountTokens.issueVerificationToken(user.getEmail());
        accountMailer.sendVerificationEmail(user.getEmail(), token);
        auditLogger.record(AuditEvent.LOGIN_UNVERIFIED, user.getId(), normalize(user.getEmail()), client, null);
        return new LoginOutcome.EmailVerificationSent();
    }

    private LoginOutcome completeLogin(User user, ClientInfo client) {
        loginThrottle.recordSuccess(normalize(user.getEmail()));
        IssuedTokens tokens = tokenService.startSession(user, client.userAgent());
        auditLogger.record(AuditEvent.LOGIN_SUCCESS, user.getId(), normalize(user.getEmail()), client, null);
        return new LoginOutcome.Authenticated(tokens);
    }

    private InvalidCredentialsException failure(String key, User user, ClientInfo client, String reason) {
        String userId = user == null ? null : user.getId();
        auditLogger.record(AuditEvent.LOGIN_FAILURE, userId, key, client, reason);
        loginThrottle.recordFailure(key).ifPresent(lock -> {
            log.warn("Login locked for {} for {}", key, lock);
            auditLogger.record(AuditEvent.ACCOUNT_LOCKED, userId, key, client, "lock=" + lock);
        });
        return new InvalidCredentialsException();
    }

    private boolean passwordMatches(String raw, String hash) {
        if (raw.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            return false;
        }
        return passwordEncoder.matches(raw, hash);
    }

    static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}

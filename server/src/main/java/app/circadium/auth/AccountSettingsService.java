package app.circadium.auth;

import app.circadium.external.mail.AccountMailer;
import app.circadium.persistence.entity.User;
import app.circadium.persistence.repository.UserRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * The account's sign-in email and its two-factor setting. Both decide who can take the account over, so both
 * require the current password ({@link CurrentPasswordCheck}), and both tell the owner by email.
 *
 * <p>An email change is the classic takeover path: whoever holds a session moves the account to their own address,
 * then resets the password. So the old address hears about the request while it can still act (a password change
 * or reset cancels the pending change), and again once the change is done ({@link EmailVerificationService}).
 *
 * <p>Accounts that sign in with Google have no password here; their email comes from Google and they have no
 * two-factor setting of ours, so both requests are refused for them.
 */
@Service
@RequiredArgsConstructor
public class AccountSettingsService {

    private final UserRepository userRepository;
    private final CurrentPasswordCheck currentPasswordCheck;
    private final LoginThrottle loginThrottle;
    private final AccountTokens accountTokens;
    private final AccountMailer accountMailer;
    private final AuditLogger auditLogger;

    /** Emails a confirmation link to {@code newEmail}; nothing changes until it is opened. */
    public void requestEmailChange(String userId, String currentPassword, String newEmail, ClientInfo client) {
        User user = passwordAccount(userId);
        String key = currentPasswordCheck.require(user, currentPassword, client, AuditEvent.EMAIL_CHANGE_DENIED);
        loginThrottle.recordSuccess(key);

        String target = CredentialsAuthService.normalize(newEmail);
        if (target.equals(key)) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "same_email", "That is already your email address.");
        }
        Optional<User> owner = userRepository.findFirstByEmailIgnoreCase(target);
        if (owner.isPresent() && !owner.get().getId().equals(user.getId())) {
            throw new AccountFlowException(HttpStatus.CONFLICT, "email_in_use",
                    "This email address is already used by another account.");
        }

        String token = accountTokens.issueEmailChangeToken(user.getId(), target);
        accountMailer.sendEmailChangeVerification(target, token);
        accountMailer.sendEmailChangeRequestedNotice(user.getEmail(), target);
        auditLogger.record(AuditEvent.EMAIL_CHANGE_REQUESTED, user.getId(), key, client, "to=" + target);
    }

    /** Idempotent: asking for the current setting changes and sends nothing. */
    public void setTwoFactor(String userId, String currentPassword, boolean enabled, ClientInfo client) {
        User user = passwordAccount(userId);
        String key = currentPasswordCheck.require(user, currentPassword, client, AuditEvent.TWO_FACTOR_CHANGE_DENIED);
        loginThrottle.recordSuccess(key);
        if (user.isTwoFactorEnabled() == enabled) {
            return;
        }
        if (userRepository.updateTwoFactorEnabled(user.getId(), enabled) != 1) {
            throw accountGone();
        }
        accountMailer.sendTwoFactorChangedNotice(user.getEmail(), enabled);
        auditLogger.record(enabled ? AuditEvent.TWO_FACTOR_ENABLED : AuditEvent.TWO_FACTOR_DISABLED,
                user.getId(), key, client, null);
    }

    private User passwordAccount(String userId) {
        User user = userRepository.findById(userId).orElseThrow(AccountSettingsService::accountGone);
        if (user.getPassword() == null || user.getEmail() == null) {
            throw new AccountFlowException(HttpStatus.BAD_REQUEST, "no_password",
                    "This account signs in with Google, which manages its email and sign-in security.");
        }
        return user;
    }

    private static AccountFlowException accountGone() {
        return new AccountFlowException(HttpStatus.UNAUTHORIZED, "account_not_found", "This account no longer exists.");
    }
}

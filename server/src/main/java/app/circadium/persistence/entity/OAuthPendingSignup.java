package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * A first sign-in through a provider that does not vouch for the email address, waiting for the address's owner to
 * open the emailed link. No user row exists until then, so nobody can hold an account under someone else's address
 * by naming it at the provider. The raw link token only exists in the email; this row keeps its SHA-256 hash.
 *
 * <p>{@code (provider, subject)} is unique: a second attempt with the same provider account replaces the first.
 */
@Entity
@Table(name = "oauth_pending_signups")
@Getter
@Setter
public class OAuthPendingSignup {

    @Id
    private String tokenHash;

    private String provider;

    private String subject;

    private String email;

    private String name;

    private String image;

    private Instant createdAt;

    private Instant expiresAt;
}

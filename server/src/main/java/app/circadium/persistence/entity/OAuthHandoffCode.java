package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * A one-time code that hands a finished provider sign-in to the client that started it. The raw code only ever
 * exists in the redirect to that client; this row keeps its SHA-256 hash, so a leaked table cannot be redeemed.
 *
 * <p>{@code challenge} is the base64url SHA-256 of a verifier the client generated before the sign-in began;
 * redeeming the code requires presenting that verifier.
 */
@Entity
@Table(name = "oauth_handoff_codes")
@Getter
@Setter
public class OAuthHandoffCode {

    @Id
    private String codeHash;

    private String userId;

    private String challenge;

    private String client;

    private Instant expiresAt;
}

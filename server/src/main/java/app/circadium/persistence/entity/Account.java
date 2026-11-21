package app.circadium.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "accounts")
@Getter
@Setter
public class Account {

    @Id
    private String id;

    @Column(name = "user_id")
    private String userId;

    private String type;

    private String provider;

    @Column(name = "provider_account_id")
    private String providerAccountId;

    @Column(name = "refresh_token")
    private String refreshToken;

    @Column(name = "access_token")
    private String accessToken;

    @Column(name = "expires_at")
    private Integer expiresAt;

    @Column(name = "token_type")
    private String tokenType;

    private String scope;

    @Column(name = "id_token")
    private String idToken;

    @Column(name = "session_state")
    private String sessionState;

}

package app.circadium.persistence.entity;
import app.circadium.persistence.enums.UserRole;
import app.circadium.persistence.enums.AiMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {

    @Id
    private String id;

    private String name;

    private String email;

    @Column(name = "email_verified")
    private Instant emailVerified;

    private String image;
    
    private String password;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    private UserRole role;

    private boolean isTwoFactorEnabled;

    private int dataVersion;

    @Column(name = "onboarded_at")
    private Instant onboardedAt;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "ai_mode")
    private AiMode aiMode;

    @Column(name = "ai_model")
    private String aiModel;

}

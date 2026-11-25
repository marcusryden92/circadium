package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "FeedbackReports")
@Getter
@Setter
public class FeedbackReport {

    @Id
    private String id;

    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    private String dataSnapshot;

    private String userId;

    private Instant createdAt;

}

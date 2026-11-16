package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "EngineMessages")
@Getter
@Setter
public class EngineMessage {

    @Id
    private String id;

    private String type;

    private String tone;

    @JdbcTypeCode(SqlTypes.JSON)
    private String payload;

    private boolean dismissed;

    private String userId;

    private String createdAt;

    private String updatedAt;

}

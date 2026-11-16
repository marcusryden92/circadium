package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "DraftConversations")
@Getter
@Setter
public class DraftConversation {

    @Id
    private String id;

    private String title;

    @JdbcTypeCode(SqlTypes.JSON)
    private String messages;

    private String userId;

    private String createdAt;

    private String updatedAt;

}

package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "QueueMembers")
@Getter
@Setter
public class QueueMember {

    @Id
    private String id;

    private double sortOrder;

    private String queueId;

    private String plannerId;

    private String userId;

    private String createdAt;

    private String updatedAt;

}

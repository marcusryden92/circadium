package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "CategoryTimeWindows")
@Getter
@Setter
public class CategoryTimeWindow {

    @Id
    private String id;

    private int day;

    private String startTime;

    private String endTime;

    private String recurrenceExceptions;

    private String categoryId;

    private String userId;

}

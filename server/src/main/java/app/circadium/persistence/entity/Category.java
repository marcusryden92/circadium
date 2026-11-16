package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "Categories")
@Getter
@Setter
public class Category {

    @Id
    private String id;

    private String name;

    private String icon;

    private String color;

    private int sortOrder;

    private boolean useTimeWindows;

    private boolean isStrict;

    private boolean confineToOwnWindows;

    private String locationId;

    private String parentId;

    private String userId;

    private String createdAt;

    private String updatedAt;

}

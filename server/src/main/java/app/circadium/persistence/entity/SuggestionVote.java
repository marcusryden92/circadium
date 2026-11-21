package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "SuggestionVotes")
@Getter
@Setter
public class SuggestionVote {

    @Id
    private String id;

    private int value;

    private String suggestionId;

    private String userId;

    private String createdAt;

}

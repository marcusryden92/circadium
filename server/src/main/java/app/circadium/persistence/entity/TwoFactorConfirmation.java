package app.circadium.persistence.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "TwoFactorConfirmation")
@Getter
@Setter
public class TwoFactorConfirmation {

    @Id
    private String id;

    private String userId;

}

package app.circadium.persistence.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import app.circadium.persistence.entity.User;

public interface UserRepository extends JpaRepository<User, String> {
    
}

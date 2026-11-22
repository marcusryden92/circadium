package app.circadium.persistence.repository;

import app.circadium.persistence.entity.CategoryTimeWindow;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CategoryTimeWindowRepository extends JpaRepository<CategoryTimeWindow, String> {

    /**
     * The windows of the user's categories. Selected through the category, not the window's own {@code userId},
     * so a window whose category was deleted ({@code categoryId} set null) is left out, as the web's
     * {@code include: { timeSlots: true }} leaves it out.
     */
    @Query("select w from CategoryTimeWindow w where w.categoryId in "
            + "(select c.id from Category c where c.userId = :userId) order by w.id")
    List<CategoryTimeWindow> findByCategoryOwner(@Param("userId") String userId);
}

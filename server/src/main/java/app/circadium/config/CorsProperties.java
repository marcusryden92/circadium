package app.circadium.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * @param allowedOrigins the web origins that may call the API with the user's cookies, written as browsers send
 *     them in {@code Origin}: scheme, host and port, no path
 */
@Validated
@ConfigurationProperties("circadium.cors")
public record CorsProperties(@NotEmpty List<@NotBlank String> allowedOrigins) {}

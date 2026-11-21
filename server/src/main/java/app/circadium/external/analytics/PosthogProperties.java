package app.circadium.external.analytics;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * PostHog's private API, used only to erase a deleted account's analytics person.
 *
 * @param personalApiKey a personal API key with the {@code person:write} scope; with {@code projectId} blank,
 *     erasure is off
 * @param projectId the PostHog project the web app reports to
 * @param apiHost the PostHog app host for that project's region (not the ingestion host)
 */
@Validated
@ConfigurationProperties("circadium.analytics.posthog")
public record PosthogProperties(String personalApiKey, String projectId, @NotBlank String apiHost) {

    public boolean configured() {
        return personalApiKey != null && !personalApiKey.isBlank() && projectId != null && !projectId.isBlank();
    }
}

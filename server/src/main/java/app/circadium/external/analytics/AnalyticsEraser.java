package app.circadium.external.analytics;

/** Erases what the product-analytics service holds about a person, as part of deleting their account. */
@FunctionalInterface
public interface AnalyticsEraser {

    /**
     * Starts erasing the analytics person the web app identified by this user id, events included. Returns at
     * once: the account is already gone when this runs, so a failure is reported to Sentry for a manual
     * erasure rather than back to the user.
     */
    void erasePerson(String userId);
}

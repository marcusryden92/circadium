/**
 * Administrative endpoints, all under {@code /admin/**}: the security chain admits only an ADMIN whose
 * sign-in passed the emailed 2FA code (the API-docs rule), so controllers here never re-check. First
 * surface: the feedback-report inspector over the rows {@code feedback} stores.
 */
package app.circadium.admin;

import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  posthog.init(key, {
    api_host: "/relay-cq",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-05-30",
    // Cookieless: nothing persisted on the device, so no consent banner is
    // required. Identified users still merge across visits via identify().
    persistence: "memory",
    respect_dnt: true,
    // Pageviews record the URL, and the auth pages carry credentials in it:
    // `token` in the emailed links, `code` on the Google sign-in return.
    // Ad-click ids (gclid, fbclid, ...) are masked along with them.
    mask_personal_data_properties: true,
    custom_personal_data_properties: ["token", "code"],
    // That masking covers event properties, not a replay's own page URL, and
    // a replay starts recording with the page load. So a page load on an auth
    // page records nothing. Sign-in and sign-out end in full page loads, so
    // recording resumes on the next page the app loads.
    disable_session_recording: window.location.pathname.startsWith("/auth/"),
    session_recording: {
      maskAllInputs: true,
    },
  });
}

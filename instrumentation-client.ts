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
    session_recording: {
      maskAllInputs: true,
    },
  });
}

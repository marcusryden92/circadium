// The freshness policy (TTL, unroutable retry, refresh gates, the monthly
// element budget) lives on the Java API since plan 2.2 — see the server's
// calendar/TravelRefreshPolicy. Only the location cap stays client-side: the
// Locations UI disables its add affordances at the cap instead of discovering
// it from the API's refusal.
export const MAX_LOCATIONS = 5;

/**
 * Sign-in with Google. Spring Security's OAuth 2.0 client runs the exchange with Google (state, PKCE, nonce,
 * ID-token verification); this package validates who started the sign-in, matches or creates the account, and
 * hands the result to the client through a one-time code redeemed at {@code POST /auth/handoff}.
 */
package app.circadium.auth.oauth;

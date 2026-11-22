/**
 * Sign-in with Google, Microsoft and Apple. Spring Security's OAuth 2.0 client runs the exchange with the provider
 * (state, PKCE where the provider supports it, nonce, ID-token verification); this package validates who started
 * the sign-in, matches or creates the account (or mails a link first, for an email the provider does not vouch
 * for), and hands the result to the client through a one-time code redeemed at {@code POST /auth/handoff}.
 */
package app.circadium.auth.oauth;

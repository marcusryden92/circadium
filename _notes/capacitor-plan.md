# Circadium — Capacitor wrap for iOS + Android

## Context

Circadium is mobile-tailored web-first, and Marcus wants real iOS + Android apps with notifications. FullCalendar isn't native-compatible and the app is SSR (Next 14 App Router + server actions + NextAuth JWT + Prisma) so a static export is impossible — the shell is a **Capacitor WebView loading the production origin `https://circadium.app` via `server.url`**. Marcus develops on Windows 10; iOS builds happen on a **borrowed Mac / MacinCloud**. No Apple Developer or Play Console accounts exist yet.

Decisions made (user-confirmed):
- **v1 notifications = local notifications**, scheduled on-device from the engine's placed events (`engineOutput.calendar`). Server push is out of scope (the engine only runs client-side, so the DB is stale for inactive users anyway).
- **OAuth = system-browser flow** (Google blocks OAuth in embedded webviews). Requires a one-time-token session handoff back into the WebView, because the OAuth cookie lands in Safari/Chrome, not the app. Consequence: Apple guideline 4.8 ⇒ **Sign in with Apple is mandatory for the iOS submission** (Android can ship without it).
- Capacitor lives in this repo: `capacitor.config.ts` at root + committed `android/` and `ios/` folders.

Exploration findings that shape the plan (verified):
- No `export const viewport` exists → `viewport-fit=cover` is missing → **all existing `env(safe-area-inset-*)` CSS resolves to 0** in a WKWebView ([app/layout.tsx](app/layout.tsx) exports only metadata).
- [MobileTabs.css.ts:13-29](components/ui/shell/MobileTabs/MobileTabs.css.ts) — tab bar is `position: fixed; bottom: 12` with **no safe-area inset** → collides with the iPhone home indicator.
- App shell uses plain `100vh` ([AppShell.css.ts:6](components/ui/shell/AppShell/AppShell.css.ts), body inline style in layout.tsx). Fallback-array precedent exists (`["100vh","100svh"]` in app/page.css.ts).
- **No resume handling anywhere**: `useFetchCalendarData` fetches once on mount; nothing refetches/regens on visibility/foreground. A wrapped app resumed after days shows a stale calendar.
- `auth.ts:35` — `if (account?.provider != "credentials") return true;` — a Credentials provider with custom id `native-handoff` passes this (provider id ≠ `"credentials"`), correctly skipping email-verification/2FA re-checks at redeem time.
- Placed events: `engineOutput.calendar` (`SimpleEvent[]`, `start`/`end` ISO strings, `id` = planner id, `extendedProps.eventType` discriminator); identity stable across regens (`stabilizeEvent`). Fresh output lands via `applyEngineRun` in [useManuallyRefreshCalendar.ts:180-189](hooks/useManuallyRefreshCalendar.ts). `lastEngineRunAt` exists in engineOutputSlice.
- Settings precedent to copy for a new preference: `weekStartDay` (prisma → [actions/scheduling.ts:112-127](actions/scheduling.ts) → [schedulingSettingsSlice.ts:175-177](redux/slices/schedulingSettingsSlice.ts) → SchedulingSection). Settings page has a placeholder Notifications section (`ComingSoonSection` at [SettingsView.tsx:172-174](app/(protected)/settings/_components/SettingsView.tsx)).
- Token-table precedent for the handoff token: VerificationToken / PasswordResetToken / TwoFactorToken / AccountDeletionToken in [prisma/schemas/models/user.prisma](prisma/schemas/models/user.prisma).
- `target="_blank"` Anthropic-console links ([AssistantGate.tsx:78-85](components/draft/AssistantGate/AssistantGate.tsx), [AISection.tsx:122-128](app/(protected)/settings/_components/AISection/AISection.tsx)) do nothing in a bare WKWebView.
- `.env` has `AUTH_TRUST_HOST=true` already; NextAuth cookie defaults (`__Secure-`, `SameSite=Lax`) are fine for a first-party HTTPS origin. Google Maps is server-side only. In-browser Anthropic calls (CORS) work in webviews; iOS ATS default allows api.anthropic.com.

---

## Phase 0 — Web-app prerequisites (deploy to Vercel first; benefits mobile web too)

1. **Viewport export** in [app/layout.tsx](app/layout.tsx): `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [...] }` (light/dark themeColor from the paper tokens). This alone activates every existing `env(safe-area-inset-*)`.
2. **MobileTabs safe area**: [MobileTabs.css.ts](components/ui/shell/MobileTabs/MobileTabs.css.ts) `bottom: 12` → `bottom: "calc(12px + env(safe-area-inset-bottom))"`.
3. **dvh fallbacks**: [AppShell.css.ts:6](components/ui/shell/AppShell/AppShell.css.ts) `height: ["100vh", "100dvh"]`; move the body inline sizing from layout.tsx into `globals.css` (`min-height: 100vh; min-height: 100dvh`) since inline styles can't express fallbacks.
4. **Overscroll**: `overscroll-behavior: none` on `html, body` in globals.css (kills rubber-band/pull-to-refresh in the shell).
5. **Resume/staleness refresh**:
   - Refactor [hooks/useFetchCalendarData.ts](hooks/useFetchCalendarData.ts) to expose a `refetch()` callback (mount effect calls it once — behavior unchanged).
   - New `hooks/useAppResumeRefresh.ts`: on `document.visibilitychange` → visible (plus Capacitor `App.appStateChange` when native), if `lastEngineRunAt` is null/older than ~15 min → `refetch()` then regen via `updateAll`. Re-entrancy guard with a ref. Mount in [CalendarProvider.tsx](context/CalendarProvider.tsx).
6. **Native integration seam `lib/native/`** (one module gates ALL Capacitor access behind `Capacitor.isNativePlatform()`; plugin packages loaded via dynamic `import()` so the web bundle stays clean):
   - `platform.ts` (`isNative()`, `getNativePlatform()`), `browser.ts` (`openExternal(url)` — Browser.open native / `window.open` web), `notifications.ts` (permission + `replaceScheduledNotifications` + Android channel + tap listener), `appEvents.ts` (resume + `appUrlOpen` listeners), `chrome.ts` (StatusBar style, `SplashScreen.hide()`, Keyboard config), `index.ts` barrel.
   - New `components/native/NativeBridge/` (folder-per-component), `"use client"`, rendered in **root** layout inside `SessionProvider` (must be alive on `/auth/login` for the auth deep link). On mount when native: configure chrome, create the notification channel, register `appUrlOpen` + notification-tap listeners (routing via `next/navigation`). Renders null.
7. **External links**: route the two Anthropic-console `target="_blank"` links through `openExternal()`.
8. Known issue to log, not fix: `window.innerHeight` in [useTouchDragReorder.ts:139](components/draggable/useTouchDragReorder.ts) and [usePopoverPosition.ts:47](hooks/usePopoverPosition.ts) doesn't track the keyboard; fix with `visualViewport` only if testing shows breakage.

## Phase 1 — Capacitor scaffolding

1. Packages (Capacitor 7; needs Node 20+, JDK 21, Xcode 16 on the Mac):
   `pnpm add @capacitor/core @capacitor/app @capacitor/browser @capacitor/local-notifications @capacitor/status-bar @capacitor/splash-screen @capacitor/keyboard @capacitor/ios @capacitor/android` + `pnpm add -D @capacitor/cli`. If plugin discovery fails under pnpm, add `public-hoist-pattern[]=@capacitor/*` to `.npmrc`.
2. `capacitor.config.ts` at root:
   - `appId: "app.circadium.mobile"` (**immutable on both stores — final decision**), `appName: "Circadium"`, `webDir: "capacitor/web"` (committed one-line stub `index.html`; never served — `server.url` wins), `server: { url: "https://circadium.app", cleartext: false }`, `appendUserAgent: "CircadiumNative"`, `ios: { contentInset: "never" }`, plugins: `SplashScreen { launchAutoHide: false }` (NativeBridge hides after hydration), `Keyboard { resize: "body" }` (revisit in testing).
   - Leave `allowNavigation` unset — stray external navigations then escape to the system browser (desired); Anthropic calls are XHR/CORS, not navigation.
3. `pnpm exec cap add android` / `cap add ios` (both work on Windows; pods install later on the Mac). Commit both folders. Gitignore: `android/.gradle`, `android/app/build`, `android/local.properties`, `android/keystore.properties`, `ios/App/Pods`, `ios/App/App/public`, `android/app/src/main/assets/public`.
4. Icons/splash: export `public/logo.svg` → `resources/icon.png` (1024²) + `resources/splash(-dark).png` (2732²), then `pnpm dlx @capacitor/assets generate --ios --android`.
5. Scripts: `"cap:sync"`, `"cap:android"`, `"cap:ios"`.
6. Checkpoint: Android emulator loads prod origin; **email/password login works end-to-end now** (Google OAuth in-webview is expected to fail until Phase 3) — validates safe areas, tab bar, keyboard, resume refresh.

## Phase 2 — Local notifications

1. **Persistence split**:
   - Account-level lead time: `reminderLeadTimeMinutes Int @default(10)` on `UserSchedulingPreferences` ([scheduling.prisma](prisma/schemas/models/scheduling.prisma)), migration `add_reminder_lead_time`; `updateReminderLeadTime` action modeled on `updateWeekStartDay`; slice field + reducer + hydration following the weekStartDay path.
   - Per-device enabled toggle: localStorage `notifications.enabled.<userId>` (user-scoped, ThemeProvider precedent); true only while OS permission is granted.
2. **Pure builder** `utils/notifications/buildReminderSchedule.ts`: filter `calendar` to `extendedProps.eventType === "planner" | "template"` with `start − lead > now`; sort ascending; take first **60** (**iOS caps pending local notifications at 64**); map to `{ id, title, body, at, extra: { route: "/calendar" } }` with `id` = stable 31-bit positive hash of `event.id + start` (LocalNotifications requires Java-int ids; event ids are regen-stable via `stabilizeEvent`). Jest tests: cap, past-exclusion, id stability.
3. **Scheduler hook** `hooks/useNotificationScheduler.ts`, mounted in CalendarProvider: effect on `[calendar, leadMinutes, enabled]`, debounced ~3s; wholesale cancel-pending + schedule (≤60 rows — simpler and drift-proof vs diffing); no-op / cancel-all when not native, disabled, or permission lost. Resume already triggers regen (Phase 0.5) → effect re-runs.
4. **NativeBridge additions**: Android channel `event-reminders` (importance 4) at startup; `localNotificationActionPerformed` → `router.push(extra.route ?? "/dashboard")`. Android 13+ runtime permission via plugin `requestPermissions()`.
5. **Settings UI**: new `app/(protected)/settings/_components/NotificationsSection/` replacing `ComingSoonSection` at [SettingsView.tsx:172-174](app/(protected)/settings/_components/SettingsView.tsx): enable switch (permission request; "enable in system settings" copy when hard-denied), lead-time select (0/5/10/15/30/60). On web, controls disabled with "Reminders fire from the Circadium mobile app" copy.

## Phase 3 — Native auth handoff (system-browser OAuth)

Cookie problem: OAuth completes in the system browser → session cookie lives there, not in the WebView. Fix = one-time token handoff:

1. **Token model** `NativeHandoffToken` in [user.prisma](prisma/schemas/models/user.prisma) (id, userId FK cascade, `token @unique`, `expires`; TTL 60s; single-use). Migration `add_native_handoff_token`. Helpers: `generateNativeHandoffToken(userId)` in [lib/tokens.ts](lib/tokens.ts) (delete existing/expired rows then create; `crypto.randomBytes(32).toString("hex")`), `data/nativeHandoffToken.ts` getter — all matching existing token-table patterns.
2. **Flow**:
   - [Social.tsx](components/auth/Social.tsx): when `isNative()` → `openExternal("${origin}/auth/native-start?provider=…")`; else current `signIn(provider, { callbackUrl })`. (`@capacitor/browser` = SFSafariViewController / Custom Tabs — satisfies Google's policy.)
   - `app/auth/native-start/page.tsx` (add to `publicRoutes` in [routes.ts](routes.ts) — NOT `authRoutes`, which bounce logged-in users): if session exists → replace to `/auth/native-complete`; else `signIn(provider, { callbackUrl: "/auth/native-complete" })`. Validate provider whitelist.
   - `app/auth/native-complete/page.tsx` (protected by default middleware): server component — `auth()` → mint token → client child fires `window.location.href = "circadium://auth/handoff?token=…"` + visible "Open Circadium" button (gesture fallback) + "you can close this window".
   - NativeBridge `appUrlOpen`: parse `circadium://auth/handoff?token=…` (mind host/pathname split on custom schemes) → `Browser.close().catch(()=>{})` → `signIn("native-handoff", { token, callbackUrl: DEFAULT_LOGIN_REDIRECT })` — same-origin POST inside the WebView sets the session cookie there.
   - **Redeem provider** in [auth.ts](auth.ts) (needs DB — not auth.config.ts): `Credentials({ id: "native-handoff", … authorize: lookup by token → delete row unconditionally → reject missing/expired → return getUserById(userId) })`. Verified: `auth.ts:35` early-returns `true` for provider ids ≠ `"credentials"`, so redeem skips email-verification/2FA re-checks (the browser session already passed them) — add a one-line comment there stating this is intentional.
3. **Scheme registration**: Android — `android:launchMode="singleTask"` + VIEW/BROWSABLE intent-filter with `scheme="circadium"` on MainActivity; iOS — `CFBundleURLTypes/CFBundleURLSchemes: ["circadium"]` in Info.plist (plain-text editable on Windows).
4. Email links (verify/reset/delete) keep opening in the system browser — accepted v1; Universal Links/App Links deferred.
5. **Sub-phase 3b — Sign in with Apple** (blocked on Apple enrollment; required before iOS submission, not for Android):
   - Portal: App ID + **Services ID** (return URL `https://circadium.app/api/auth/callback/apple`) + `.p8` key; client secret is a self-signed ES256 JWT (max 6-month validity — calendar the regeneration).
   - `auth.config.ts`: add Apple provider; test the `form_post` callback on the deployed origin (may need SameSite=None cookie overrides for the Apple callback in NextAuth v5).
   - Add Apple button to Social.tsx (same native-start flow).

## Phase 4 — Android ship path (all on Windows)

1. Android Studio (bundled JDK 21) → `cap sync android` → run on Pixel emulator (API 34/35).
2. Upload keystore via `keytool` — store outside the repo (password manager + offline backup); use Play App Signing. `keystore.properties` (gitignored) + `signingConfigs.release` in `android/app/build.gradle`; `versionCode`/`versionName` bumped manually per upload.
3. Build `.aab` (`./gradlew bundleRelease` or Android Studio).
4. **Play Console** ($25 one-time). Personal accounts must pass a **closed test** (~12+ opted-in testers, 14 consecutive days — verify the current requirement in the Console) before production access — start the internal testing track immediately; this is the long pole.
5. Listing blockers: **privacy policy URL — none exists**: add public `app/privacy/page.tsx` (+ `/privacy` in `publicRoutes`) including an account-deletion explanation (Google requires a web deletion link; the app has in-app deleteAccount). Data-safety form: email/name (account), calendar content (functionality), no ads/tracking, BYOK key never leaves the device. Assets: 512px icon, 1024×500 feature graphic, ≥2 screenshots.

## Phase 5 — iOS ship path (borrowed Mac / MacinCloud)

Prepared in advance on Windows: `ios/` committed; Info.plist edited in text (`CFBundleURLTypes`, `CFBundleDisplayName`, `ITSAppUsesNonExemptEncryption=false`); icons committed; bundle id registered + App Store Connect app record + TestFlight group + App Privacy labels + review notes (demo account) — all doable from a browser. Local notifications need **no** entitlement or Info.plist usage key. The Mac never needs `.env` (the native build never runs `next build`).

Mac session checklist (time-boxed):
1. Machine with **Xcode 16.x** (App Store requires the iOS 18 SDK — pick the MacinCloud image accordingly).
2. Node 20 + `corepack prepare pnpm@9.15.4 --activate` + CocoaPods.
3. Clone with a throwaway fine-grained PAT; `pnpm install` (fall back to `--ignore-scripts` if prisma postinstall complains).
4. `pnpm exec cap sync ios` → `cap open ios`.
5. Xcode: sign in, select Team, automatic signing, confirm bundle id. No extra capabilities.
6. Simulator smoke test: native handoff login (Phase 3 deployed), a local notification fires, tab bar clears home indicator, splash hides.
7. Product → Archive → Distribute → TestFlight.
8. Sign out of Apple ID, revoke PAT, wipe clone before releasing the machine.

App Review risk register:
- **4.2 minimum functionality** (wrapper apps rejected when they feel like websites): mitigations that must demonstrably work — local notifications, native splash + status bar, correct safe areas, system-browser OAuth, keyboard behavior; call them out in review notes.
- **4.8**: Sign in with Apple live before submission.
- **5.1.1(v)** account deletion: exists (Settings → Danger zone) — mention in review notes.
- Privacy policy + App Privacy labels (BYOK on-device key is a good story — state it).

## Marcus's to-do list (non-code, start these on day 1)

1. **Enroll in the Apple Developer Program** ($99/yr, individual — no D-U-N-S needed). Approval can take days; everything in Phase 3b/5 is blocked on it.
2. **Register a Google Play Console account** ($25 one-time). The 14-day closed-testing requirement for new personal accounts is the Android schedule's long pole — recruit ~a dozen testers early.
3. Confirm `https://circadium.app` production deploy is healthy and `NEXT_PUBLIC_APP_URL` is set to it in Vercel.
4. **Security**: `.env` at repo root holds live secrets (Anthropic key, Google OAuth secret, Resend key, Neon password). Verify it never entered git history (`git log --all --oneline -- .env`); rotate anything doubtful; never copy `.env` to a rented Mac; use a short-lived PAT per Mac session and revoke after.
5. Decide the final `appId` (`app.circadium.mobile` proposed) — it can never change once shipped.
6. Write/approve a privacy policy (needed by both stores).

## Ordering & verification

```
Phase 0 (web, deploy) → Phase 1 (scaffold) → Phase 2 (notifications) ─┐
                                     └─────→ Phase 3 (auth handoff) ──┼→ Phase 4 (Android ship)
Apple enrollment (day 1) → Phase 3b (Apple sign-in) ──────────────────┴→ Phase 5 (iOS ship)
```

Phases 2 and 3 are independent; both need 0+1. Web-side pieces of 2/3 (prisma, actions, settings UI, handoff pages, provider) deploy to Vercel and are testable in a desktop browser before any native binary exists (hit `/auth/native-start` and watch the `circadium://` redirect attempt).

**The Android emulator on Windows validates ~90% before any Mac time**: shell rendering, safe areas, credentials login, resume refresh, notification schedule/tap, and the full system-browser OAuth round trip (custom schemes work on the emulator).

Per-phase acceptance:
- P0: on a real phone browser at circadium.app — tab bar clears the home indicator, no rubber-band, calendar refreshes after backgrounding >15 min. `pnpm lint` + `pnpm test` green.
- P1: emulator loads prod origin, email login works, splash hides, status bar styled.
- P2: reminder fires at start−lead; regen reschedules; >60 upcoming → nearest 60 only; tap opens /calendar; toggle-off cancels all pending. Jest tests for the builder.
- P3: Google + GitHub via Custom Tab → deep link → session cookie set in the WebView; expired/reused token redeem rejected.
- P4/P5: internal-track install from Play; TestFlight install on a real iPhone.

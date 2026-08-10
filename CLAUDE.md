  # Circadium — Project Documentation for AI Assistants

  Circadium is a personal scheduling app: it takes a tree of tasks/goals/plans plus recurring templates and categories, and produces a fully placed weekly calendar with travel time injected between locations. The package directory is still named `lifeplan/` (legacy); the UI brand is **Circadium** (see [app/layout.tsx](app/layout.tsx)).

  This file is the high-level map. For engine internals, read [documentation/calendar-generation-deep-dive.md](documentation/calendar-generation-deep-dive.md).

  ---

  ## Stack

  - **Next.js** 16.3 — App Router, server actions, `(protected)` route group. Builds run **webpack, not Turbopack** (`--webpack` in the dev/build scripts): the custom webpack config (rrule alias + `node:` stubs for the Anthropic SDK) and the Vanilla Extract plugin's experimental Turbopack support make the default bundler a later migration. `middleware.ts` is kept deliberately (deprecated in favor of `proxy.ts`, but proxy drops the edge runtime this middleware is built for), and `agentRules: false` stops `next dev` from appending its managed block to this file.
  - **React** 19, **TypeScript** 6.0.3 (strict, `moduleResolution: "bundler"`, `@/*` path alias).
  - **Prisma** 7.8 with `@prisma/adapter-pg` driver adapter (Prisma 7 requires a driver adapter at construction time — see [lib/db.ts](lib/db.ts)). Client is generated to `generated/client` (outside `/prisma/` so the VS Code Prisma extension doesn't merge its embedded `schema.prisma` copy with the source schema) and imported as `@/generated/client`.
  - **PostgreSQL** (local: `docker-compose.dev.yml`, port 5433, db `lifeplan_dev`).
  - **NextAuth** v5 (5.0.0-beta.32). Edge-safe config in [auth.config.ts](auth.config.ts) (OAuth providers only, used by middleware); full config with Credentials + adapter in [auth.ts](auth.ts).
  - **Vanilla Extract** for styling — `@vanilla-extract/{css,sprinkles,recipes,dynamic,next-plugin}`. Every page/component has a co-located `*.css.ts` file. There is no Tailwind in this project despite a leftover `components.json`.
  - **Redux Toolkit** for cross-component state, **React Context** for scoped providers (Store, User, Calendar, Capture, Search).
  - **FullCalendar** 6.1 for the calendar surface (with `@fullcalendar/luxon3` + **Luxon** 3 as the timezone plugin); **date-fns** 3 for date math (engine has its own [dateTimeService](utils/calendar-generation/utils/dateTimeService.ts)); **rrule** for template recurrence.
  - **node-ical** for parsing subscribed ICS feeds (server-only), the **Google Calendar API** (read-only) for connected Google accounts, and **Microsoft Graph** (read-only, `Calendars.Read`) for connected Microsoft accounts — the external-calendar integration (see "External calendars" in the domain model).
  - **React Hook Form** + **Zod** for forms.
  - **Jest** + **Testing Library** for tests.
  - **Anthropic SDK** (`@anthropic-ai/sdk`) for the AI assistant — an IN-BROWSER tool-use loop (BYOK: each user's own API key, held encrypted in a per-device IndexedDB vault, calls api.anthropic.com directly via the SDK's `dangerouslyAllowBrowser` + CORS opt-in header; the key never touches our server): `propose_goals` input JSON is parsed incrementally with `partial-json` and folded via `onForest` callbacks; deterministic edit tools (items, templates, category windows/flags, queues/dependencies) execute in the engine and emit their results through the same callback contract. Engine: [utils/draft/assistantEngine/](utils/draft/assistantEngine/); vault: [lib/aiKey.ts](lib/aiKey.ts); gating: `User.aiMode` + `AiAccessProvider`.
  - **pnpm** 9.15.4 — use `pnpm` for all commands.

  ---

  ## Code style rules

  - **No emojis** in code, comments, or generated docs.
  - **No narration comments** ("// fixed to handle X", "// updated to use new API"). Comments explain *why* something non-obvious exists, not *what* the code does.
  - **No summary, changelog, refactor-notes, or migration-notes markdown files** added to the repo. Make the change and commit.
  - **Absolute imports with `@/`** prefix.
  - **Prefer server actions** (`"use server"` files in [actions/](actions/)) over `app/api/` routes. API routes exist only for `auth/`, `admin/`, and `integrations/{google,microsoft}/` (the calendar OAuth connect + callback handlers, which need a redirect URI a server action can't provide). (The AI assistant's old SSE route is gone — its tool-use loop runs in the browser on the user's own key; see the AI-assistant section.)
  - **Zod schemas** in [schemas/](schemas/) for any user-facing form.
  - Spell out "category" — never "cat".
  - The location surface is named **Locations**, not "Places" (Google Places is the underlying API, but the user-facing concept is Location).

  ---

  ## Directory map

  ```
  lifeplan/
  ├── app/                              # Next.js App Router
  │   ├── layout.tsx                    # Root: SessionProvider + ThemeProvider
  │   ├── page.tsx                      # Landing
  │   ├── globals.css, page.css.ts
  │   ├── (protected)/                  # Auth-gated routes
  │   │   ├── layout.tsx                # Async server component: reads onboardedAt + aiMode, computes needsOnboarding
  │   │   ├── ProtectedProviders.tsx    # Client: StoreProvider > UserProvider > CalendarProvider > AppShell (+ onboarding overlaySlot)
  │   │   ├── calendar/                 # FullCalendar surface
  │   │   ├── capture/                  # Quick-entry surface
  │   │   ├── categories/               # Role + category management (top-level categories are surfaced as "Roles")
  │   │   ├── dashboard/                # Default landing after login
  │   │   ├── feedback/                 # Support contact (message + consented data snapshot) + suggestion wall with voting
  │   │   ├── admin/feedback/           # ADMIN-only report inspector — picker over stored FeedbackReport snapshots (structured read-only views + download) plus IMPERSONATION: "Impersonate" writes the target to sessionStorage ([utils/inspection.ts](utils/inspection.ts)) and reloads; CalendarProvider + UserProvider then hydrate ALL Redux slices from the snapshot instead of the account, every own-account bootstrap is skipped, and useCalendarServerSync takes an explicit `disabled` flag (double gate: initializeState is also never called) so nothing on screen can sync back to the admin's rows. Warning banner (InspectionBanner) with Exit; per-tab, cleared on exit/reload
  │   │   ├── graph/                    # Directional precedence graph — queues as lanes + dependencies as connectors on a time axis (_lib/graphModel + GraphCanvas)
  │   │   ├── mindmap/                  # Mind-map canvas — roles → categories → items/leaves as a zoomable radial/horizontal tree (_lib/mindmapModel + MindmapCanvas/MindmapControls)
  │   │   ├── items/[id]/               # Item detail (Overview/Subtasks/Schedule/Alerts tabs); sub-routes: subtasks/, schedule/, alerts/ (+ _components/, _hooks/useItemHandlers, _constants.ts)
  │   │   ├── library/                  # Task/goal browser
  │   │   ├── locations/                # Location + travel-time management
  │   │   ├── queues/                   # Queue (pipe) management — rail + member list + add-member modal
  │   │   ├── onboarding/               # First-run 6-step overlay (Welcome/Roles/Locations/Week/BrainDump/AI); _lib builders, _steps, _components
  │   │   └── settings/
  │   ├── auth/                         # login/register/reset/new-password/new-verification/error
  │   ├── api/                          # auth/ + admin/ + integrations/{google,microsoft}/ (calendar OAuth connect + callback)
  │   ├── privacy/                      # Public GDPR privacy-policy page (outside the (protected) group; in publicRoutes)
  │   └── test-shell/, test-tokens/, logo-test/  # Dev scaffolding
  │
  ├── actions/                          # Server actions (preferred backend surface)
  │   ├── login.ts, register.ts, reset.ts, newPassword.ts, newVerificationAction.ts, settings.ts, deleteAccount.ts
  │   ├── onboarding.ts                 # completeOnboarding() — stamps User.onboardedAt
  │   ├── scheduling.ts                 # UserSchedulingPreferences + TaskPreferences
  │   ├── categories.ts                 # Category CRUD + planner-category assignment
  │   ├── locations.ts                  # Location + Google Places integration
  │   ├── draftConversations.ts         # AI-assistant chat history (list/get/upsert/delete, capped at 50)
  │   ├── viewState.ts                  # Graph/mindmap canvas view preferences (get/save per kind) — direct upsert, outside the diff sync
  │   ├── externalCalendars.ts          # External-calendar sources (ICS + Google + Microsoft): fetch/add/refresh/update/delete + per-event busy-exception toggle — direct actions, outside the OCC diff sync
  │   ├── googleCalendar.ts             # Google Calendar OAuth connection: status / list calendars / add source / disconnect (revokes the grant)
  │   ├── microsoftCalendar.ts          # Microsoft Graph calendar connection: status / list calendars / add source / disconnect (no provider revoke — local delete only)
  │   ├── occurrenceCompletions.ts      # Occurrence-completion log (recurring tasks/goal leaves + plan check-offs): get/log/unlog — direct actions, outside the OCC diff sync
  │   ├── habits.ts                     # Habit trackers + buckets: getHabitData/createHabitBucket/updateHabitBucket/deleteHabitBucket/create/update/delete/addItem/removeItem (addItem rejects non-repeating items) + the assistant's batch applyHabitChanges — direct actions, outside the OCC diff sync
  │   ├── feedback.ts                   # Support messages (FeedbackReport rows + Resend notification to support@circadium.app; optional exportUserData snapshot stored ON the row, never emailed) + suggestion wall list/create/vote/delete — direct actions, outside the OCC diff sync
  │   ├── adminFeedback.ts              # ADMIN-gated report surface: list (snapshot presence via an id-only second query — blobs never ride the list), get snapshot blob, clear snapshot, delete report
  │   ├── dataExport.ts                 # GDPR export — exportUserData() serializes the whole account to one JSON blob (secrets excluded)
  │   ├── dataImport.ts                 # GDPR import/restore — importUserData(payload, "replace"|"add"): replace preserves ids (DB-migration restore), add remaps every id
  │   └── calendar-actions/
  │       ├── fetchCalendarData.ts      # Initial load — returns planner/calendar/template/categories/categoryEvents/travelEvents/engineMessages/queues/dependencies + dataVersion
  │       ├── fetchFreshState.ts        # Used on stale-version recovery
  │       ├── syncCalendarData.ts       # OCC-gated transactional diff sync
  │       └── sync-handlers/            # One handler per table (planner, calendar, extendedProps, template, category, timeWindow, categoryEvent, travelEvent, engineMessage, queue, queueMember, dependency, location, travelTime)
  │
  ├── components/
  │   ├── auth/                         # AuthCard, login/register/reset forms, Social, LoginButton
  │   ├── calendar/                     # WeekStructureModal + editors (Template, Window, Event tile)
  │   ├── draft/                        # Global AI assistant UI — chat (+ DB-backed history popover) + tabbed Goals/Week/Categories/Queues/Habits diff view; mounted in the AppShell assistant slot, opened anywhere via mod+I / sidebar / item-detail entry points. One folder per component: AIDraftModal, AssistantGate (BYOK key-entry panel shown when AI isn't ready), ChatPane, ChatHistoryPopover, GlobalAssistant, JsonTreeView, TemplateWeekView, WindowsView, PrecedenceView, HabitsView. The draft-domain logic (ops/diff/apply/contracts + the in-browser engine) lives in utils/draft/, the state hook in hooks/useAIDraftState
  │   ├── draggable/                    # DragBox, DraggableItem, TaskDivider, DraggableContext
  │   ├── events/                       # Calendar event renderers + popovers (Event, Template, Travel, CategoryWrapper, ExternalEventContent/Popover, WindowExceptionEditor, NewPlanModal, RecurrenceScopeModal, color/location pickers)
  │   ├── landing/                        # Landing-page visuals: VectorField/, FeatureVignettes/, ReflowDemo/, Reveal/
  │   ├── tasks/                        # TaskItem, TaskList, task-item-subcomponents/
  │   └── ui/                           # Custom design-system primitives (NOT pure shadcn)
  │       ├── Button, Glass, Backdrop, Grain, Masthead, ProgressBar, Loader, Logo,
  │       │   StatusTag, TypeBadge, CategoryBadge, CategoryDot, ConicDot, Caption,
  │       │   Input/Field, FieldStack/FieldValue, BottomSheet, DurationField,
  │       │   Combobox, SegmentedControl, DateTimePicker, TimePicker, ConfirmModal, Switch, StubPage, Kbd,
  │       │   ThemeProvider, useResolvedCategoryColor, CenteredLoader, AppLoadingScreen
  │       └── shell/                    # AppShell architecture
  │           ├── AppShell/             # Outer bezel + canvas + content row (+ assistantSlot inside mainColumn)
  │           ├── Sidebar/              # Desktop nav (+ Assistant action button)
  │           ├── MobileTabs/           # Mobile bottom nav (hidden on canvas routes — see nav.ts)
  │           ├── CapturePalette/       # Quick-entry overlay
  │           ├── SearchPalette/        # Cmd-K-style search
  │           ├── CornerActions/        # Mobile-only floating Search + AI-assistant cluster (hides under full-screen shell overlays AND on canvas routes)
  │           ├── CaptureContext.tsx, SearchContext.tsx, AssistantContext.tsx, ShellOverlayContext.tsx
  │           ├── AiAccessContext.tsx   # BYOK access state: server aiMode + device-key presence → status ready/needs-key/off (+ saveKey/removeKey/setMode/getApiKey)
  │           ├── NavHistoryContext.tsx # Previous-pathname tracker (usePreviousPathname) — feeds the canvas-route back button (deep-link fallback: /dashboard)
  │           └── nav.ts                # NAV_ITEMS, MOBILE_TABS, isCanvasRoute (graph/mindmap: on mobile the shell chrome yields to an in-page back button + header settings sheet — faux stack sheet)
  │
  ├── context/
  │   ├── StoreProvider.tsx             # Redux store wrapper
  │   ├── UserProvider.tsx
  │   └── CalendarProvider.tsx          # Main data context — wraps planner/calendar/template/categories + the auto-regen useEffects
  │
  ├── hooks/
  │   ├── useCurrentUser, useCurrentRole
  │   ├── useFetchCalendarData          # Initial Redux seed from server
  │   ├── useCalendarServerSync         # Diff-based sync to DB with OCC, stale recovery, rollback
  │   ├── useCalendarStateActions       # updatePlannerArray / updateTemplateArray / updateAll
  │   ├── useManuallyRefreshCalendar    # User-triggered regen
  │   ├── useViewStatePersistence       # Load-once + debounced-save for a canvas page's UserViewState blob (graph/mindmap)
  │   ├── useServerAction               # useTransition + status pattern for mutations
  │   ├── useIsMobile                   # matchMedia on media.mobile (narrow viewport OR landscape phone) — for JS-level mobile treatments (view types, bottom sheets)
  │   ├── useCoarsePointer              # matchMedia on media.touch — drives the touch interaction model (canvas gestures, touch legends, sheet swaps) on all touch devices, tablets included
  │   ├── useAIDraftState               # AI-assistant working drafts (forest/templates/windows/precedence/habits) + chat + conversation persistence
  │   ├── useCanvasGestures              # Shared graph+mindmap touch gestures (pointer classification, pinch-zoom, coordinate conversion)
  │   ├── useRenderEngineMessage         # Maps persisted EngineMessage rows into console cards (shared by the calendar EngineConsole + the item-detail Alerts tab; optional subtree filter; returns {messages, dismissed} — dismissed rows render behind a restore affordance — and prebuilds drillHref matching the calendar popover's /items/{root}/subtasks?focus={leaf} deep-link)
  │   ├── useKeyboardShortcuts, useListKeyboardNav, useClickOutside, usePopoverPosition,
  │   │   useFlashAnimation, usePlatform, useTitleEditor
  │
  ├── lib/
  │   ├── aiKey.ts                      # BYOK device vault: user's Anthropic key AES-GCM-encrypted (non-extractable CryptoKey) in IndexedDB, per userId; validateAiKey via free models.list
  │   ├── auth.ts                       # Helpers around NextAuth session
  │   ├── db.ts                         # Prisma client singleton (PrismaPg adapter)
  │   ├── google-maps-api.ts            # Places autocomplete + Routes API travel matrix
  │   ├── mail.ts, tokens.ts            # Auth flows
  │   ├── taskItem.ts
  │   └── theme/                        # The whole design system
  │       ├── tokens.css.ts             # createThemeContract: paper/bezel/ink/glass/interactive/shadow/accent/status
  │       ├── themes.css.ts             # themeLight, themeDark
  │       ├── scales.ts                 # Theme-independent numerics: space, radii, contentWidth, breakpoints, media, borderWidth, zIndex
  │       ├── sprinkles.css.ts          # Atomic style API
  │       ├── recipes.css.ts            # glass, popover, pillBtn, badge, formInput, progressTrack
  │       ├── typography.css.ts         # display, text, caption, statusTag
  │       ├── transitions.ts            # DURATIONS, theme/button/collapse/progress/interactive transitions
  │       ├── fonts.ts                  # fontDisplay, fontUI
  │       ├── effects.ts                # backdropFilters, colorMixAlpha
  │       ├── categoryColor.ts          # Category color resolution + glow/gradient/tint
  │       └── global.css.ts, index.ts
  │
  ├── prisma/
  │   ├── schemas/
  │   │   ├── schema.prisma             # Generator + datasource only
  │   │   └── models/
  │   │       ├── user.prisma           # User (+ dataVersion OCC counter, onboardedAt gate, aiMode BYOK/MANAGED/OFF), Account, VerificationToken, PasswordResetToken, TwoFactorToken, TwoFactorConfirmation, AccountDeletionToken, UserRole, AiMode
  │   │       ├── calendar.prisma       # SimpleEvent, EventExtendedProps, Planner, EventTemplate, WeekDayType, PlannerType, EventType
  │   │       ├── category.prisma       # Category, CategoryTimeWindow, CategoryEvent
  │   │       ├── location.prisma       # Location, TravelTime, TravelEvent, TransportMode
  │   │       ├── scheduling.prisma     # UserSchedulingPreferences, TaskPreferences, enums
  │   │       ├── engineMessage.prisma  # EngineMessage — engine-emitted console rows with user-owned dismissed flag
  │   │       ├── queue.prisma          # Queue + QueueMember — ordered work streams over root Planner items (one queue per planner, DB-unique)
  │   │       ├── dependency.prisma     # PlannerDependency — immutable prerequisite edges between root Planner items
  │   │       ├── draftConversation.prisma # DraftConversation — AI-assistant chat history (messages as Json)
  │   │       ├── externalCalendar.prisma # ExternalCalendarSource + ExternalEvent + GoogleCalendarConnection, ExternalCalendarKind/Mode — imported ICS + Google calendars (busy blocks fed to the engine + read-only overlay)
  │   │       ├── habit.prisma          # HabitBucket + Habit + HabitItem — trackers over repeating top-level planner items, grouped by the habits surface's OWN bucket entity, distinct from Category (outside the OCC diff sync; the OccurrenceCompletion log lives in calendar.prisma)
  │   │       └── viewState.prisma      # UserViewState — per-user graph/mindmap canvas view preferences (outside the OCC diff sync)
  │   ├── migrations/                   # 0_init … add_habit_buckets — see "Migration history" below for the full list
  │   ├── seed.ts                       # Wholesale reseed (admin@lifeplan.com / "password")
  │   └── seed-helpers/                 # generateCategories, generateLocations (+ TravelTimes), generatePlanners, generatePlans, generateTemplates
  │
  ├── redux/
  │   ├── store.ts                      # { user, calendarSource, engineOutput, schedulingSettings, externalCalendar, occurrenceCompletions, habits }
  │   ├── slices/
  │   │   ├── calendarSourceSlice.ts    # User-authored inputs: planner, template, categories, queues, dependencies, isLoaded
  │   │   ├── engineOutputSlice.ts      # Engine-derived: calendar, categoryEvents, travelEvents, engineMessages, plannerScores + lastEngineRunAt (ephemeral)
  │   │   ├── userSlice.ts
  │   │   ├── schedulingSettingsSlice.ts # bufferTimeMinutes, defaultTransportMode, allTravelTimes (full rows — sole source of truth), locations, strategy weights/scores/penalties, enableTravelEvents. The engine-shaped single-mode matrix is NOT stored; it is derived from allTravelTimes + defaultTransportMode at each engine run via deriveTravelTimeMatrix (so travel-time/mode changes take effect without a reload)
  │   │   ├── externalCalendarSlice.ts  # Imported external calendars (ICS + Google): sources + events + isLoaded. Mirrored wholesale from direct actions (hydrate/upsert/remove/applyRefresh), OUTSIDE the OCC diff sync (like viewState — never bumps dataVersion); feeds the engine as busy blocks via deriveExternalBusyEvents
  │   │   ├── occurrenceCompletionsSlice.ts # Occurrence-completion log rows (recurring tasks/goal leaves + plan check-offs). Same out-of-band pattern; feeds the engine via deriveOccurrenceCompletions
  │   │   └── habitsSlice.ts            # Habit buckets + trackers + tracked-item links. Same out-of-band pattern; the engine never reads it
  │   └── thunks/
  │       └── calendarThunks.ts         # updateAllCalendarStates — the engine entry point from Redux
  │
  ├── schemas/                          # Zod schemas (auth + TaskListSchema)
  │
  ├── types/
  │   ├── prisma.ts                     # Re-exports Prisma payload types with runtime augmentations (SimpleEvent.extendedProps gets categoryWrapperId, travel fields, trespass flags)
  │   ├── calendarTypes.ts              # WeekDayIntegers, TravelExtendedProps, TrespassingExtendedProps
  │   ├── categoryTypes.ts
  │   ├── ui.ts, user.ts, userTypes.ts
  │   ├── css.d.ts                      # Ambient `declare module "*.css"` — the one legitimate .d.ts here
  │
  ├── utils/
  │   ├── calendar-generation/          # The scheduling engine — see deep-dive doc
  │   ├── calendar-rendering/           # categoryEventsToEventInput, templatesToEventInput, travelEventsToEventInput, externalEventsToEventInput (DB rows → FullCalendar input; external is a read-only overlay, all-day rows skipped, busy-ness resolved via isExternalEventBusy)
  │   ├── server-handlers/              # compareCalendarData (the diff that feeds syncCalendarData)
  │   ├── template-handlers/, datetime/, locations/, goal-handlers/
  │   ├── assert/                       # assert.ts (+ assert.js in tsconfig include)
  │   ├── renderEngineMessage.ts        # Maps persisted EngineMessage rows into console-friendly {tag, tone, title, body, goToDate}
  │   ├── plannerBulkActions.ts         # Pure subtree ops shared by the Library bulk bar + item detail (delete, category with descendant clear, color cascade, priority)
  │   ├── planRecurrence.ts             # Recurrence primitives: rule/exception parse + serialize, plan occurrence expansion, composite occurrence ids (plannerIdFromEventId, isRecurrenceOccurrenceId), plannerHasFlexibleRecurrence
  │   ├── recurringPeriods.ts           # Shared period model for flexibly recurring tasks/goals (createdAt-anchored grid, enumerateRecurrencePeriods) — used by BOTH the engine and habit stats
  │   ├── deriveOccurrenceCompletions.ts # Occurrence-completion slice rows -> the engine's options.occurrenceCompletions shape (derived fresh per run)
  │   ├── habits/                       # Tracker statistics: computeHabitTrackerStats (per-day counts + expected-day flags + single-recurring-item period grading) + habitGridWeeks (week-aligned month layout)
  │   ├── plannerCompletion.ts          # Type-aware completion checks (plannerIsCompleted / plannerCompletedEnd) — completion never applies to plans or flexibly recurring items
  │   ├── taskSplitting.ts              # Split tasks: settings/segments parse + serialize, carving rule (grantChunkMinutes / minChunkRequired), chunk/segment event ids, per-day accounting
  │   ├── allowedTimes.ts               # Scheduling constraints: AllowedTimesSettings parse + serialize, allowed-interval intersection, weekly max-block ceiling, earliest-start parse
  │   ├── precedence/                   # Precedence shared layer: types (PrecedenceEdge), validationEdges (FULL logical order — legality), findCycle + wouldCreateCycle variants, describeCycle, readinessBlockers, prunePrecedenceInputs (thunk-run central pruning)
  │   ├── queue-handlers/               # mutateQueueMembers (THE queue-member write choke point, cycle-validated), sortOrderKeys ({id, sortOrder} generalization), queueLookups (queueCategoryByRootId / queueByPlannerId display seam — built once in CalendarProvider and exposed on its context; consume from there, never per page)
  │   ├── draft/                        # AI-assistant draft domain (pure logic; UI in components/draft/): plannerForestToJson / plannerTreeToJson (DraftForest/DraftNode contracts), draft{Templates,Windows,Precedence,Habits} (contracts + equality), draft{Forest,Template,Window,Precedence,Habit}Ops (deterministic engine ops), diffDraft* (review-pane diffs), applyDraft* (save-time applies; applyDraftHabits builds the out-of-band delta for actions/habits.applyHabitChanges), normalize/merge/assignDraftIds, assistantEngine/ (the in-browser BYOK tool-use loop: runAssistantTurn + the browser Anthropic client factory)
  │   ├── external-calendar/            # Imported-calendar domain: parseIcsFeed (node-ical, server-only), googleCalendarApi (OAuth token exchange + events.list, server-only), externalSourceServer (shared db helpers), deriveExternalBusyEvents (SimpleEvent-shaped busy blocks for the engine + isExternalEventBusy), modeExceptions (per-event busy overrides), icsUrl (ICS/webcal/Google-share-link normalization), refreshPolicy (TTL + expansion window)
  │   └── (loose helpers)               # generalUtils, badgeTone, calendarEventHandlers, categoryUtils,
  │                                     # colorUtils, dateUtils, engineTones, eventTier, goalPageHandlers,
  │                                     # plannerStatus, taskArrayUtils, taskHelpers, templateBuilderUtils,
  │                                     # timeFormatting, calendarUtils, plannerPriority (1-7 scale: clampPriority/PRIORITY_LEVELS),
  │                                     # plannerReadiness (defaultReadyForType), windowOccurrences (upcoming category-window occurrences)
  │
  ├── __tests__/
  │   ├── calendar-generation/          # Engine regression tests + fixtures/ (trimmed live-data snapshots)
  │   ├── calendar/                     # WeekStructureModal overnight window handling
  │   ├── dashboard/                    # buildTodayAgenda (occurrence-tile completion resolution)
  │   ├── draft/                        # Assistant draft-domain unit tests (forest/templates/windows/precedence ops + applies + diffs + node-edge safety + the recurrence contract)
  │   ├── draggable/                    # Touch drop-target resolution (TOP_BAND/BOTTOM_BAND)
  │   ├── external-calendar/            # ICS parse, Google + Microsoft Graph event mapping, ICS-URL normalization, busy-block derivation
  │   ├── goal-handlers/                # toggleGoalIsReady cascade + sortOrderKeys/moveItem tests
  │   ├── graph/                        # Graph-view model unit tests (root/leaf spans, lane membership, row packing, leaf-view bands, ticks)
  │   ├── hooks/                        # useCanvasGestures (pointer classification, pinch-zoom, coordinate conversion)
  │   ├── lib/                          # aiKey vault crypto (AES-GCM round trip, fresh IVs, non-extractable keys, masked hint)
  │   ├── mindmap/                      # Mindmap-view model (buildMindmapTree / layoutMindmap / zoom conversions)
  │   ├── onboarding/                   # Onboarding pure builders (reconcilers, week templates, brain dump)
  │   └── utils/                        # plannerBulkActions, planRecurrence, promoteSubtree, demoteRootIntoGoal, allowedTimes, taskSplitting, renderEngineMessage, travelRefreshPolicy, windowOccurrences, habitStats (+ precedence/ validators)
  │
  ├── documentation/
  │   └── calendar-generation-deep-dive.md
  │
  ├── notes/                            # Personal notes / TODOs — NOT documentation, do not quote
  ├── middleware.ts                     # Route protection (uses edge-safe auth.config.ts)
  ├── routes.ts                         # publicRoutes, authRoutes, apiAuthPrefix, DEFAULT_LOGIN_REDIRECT (/dashboard)
  ├── auth.ts, auth.config.ts, next-auth.d.ts
  ├── docker-compose.dev.yml
  ├── prisma.config.ts, components.json (legacy), jest.config.ts, jest.setup.ts
  ├── next.config.mjs                   # withVanillaExtract + rrule webpack alias
  └── package.json                      # pnpm scripts
  ```

  ---

  ## Core domain model

  ### Planner (the central schedulable row)

  ```ts
  {
    id, title, parentId?,
    plannerType: "task" | "plan" | "goal",
    duration: number,             // minutes
    deadline?: ISO,
    starts?: ISO,                 // plan items only
    recurrence?: string | null,   // JSON {freq, interval, until}. Plans: fixed occurrence expansion anchored on starts. Task/goal ROOTS: flexible per-period auto-scheduling (see "Flexible recurrence"); mutually exclusive with deadline
    recurrenceExceptions?: string | null, // per-occurrence moved/deleted overrides (JSON)
    sortOrder: number,            // fractional sibling key within a parentId group (0 on roots — top-level order non-semantic)
    priority: number,
    isReady?: boolean,            // universal scheduling gate (tasks + goals): schedules only when true. Tasks/plans default ready on create; goals need subtasks + deadline. Orthogonal to isTriaged (which owns "draft")
    isTriaged: boolean,           // false until first Capture save moves the item out of the triage queue; the sole "draft" signal (readiness never implies draft)
    maxMinutesPerDay?: number,    // goal roots only — daily cap on the subtree's scheduled minutes (see "goal daily cap")
    earliestStartDate?: ISO,      // tasks + goals — never placed before this instant; inherits down the tree (see "scheduling constraints")
    allowedTimes?: string,        // tasks + goals — JSON {days, ranges}; restricts placement to given weekdays / time-of-day spans, intersected down the tree
    notes?: string | null,        // free-form user notes; never read by the engine, not in the AI draft contract (survives assistant saves on retained rows via spread-preserve)
    splitting?: string | null,    // tasks / goal leaves — JSON {minMinutes, maxMinutes, maxMinutesPerDay?, minSpacingMinutes?}; places as dynamic chunks (see "split tasks")
    completedSegments?: string | null, // per-chunk completion record (JSON [{start, end}]); completed minutes always derived by summing (never in the AI draft contract)
    completedStartTime?, completedEndTime?,
    linkedItemId?: string | null, // detour: a placeholder subtask redirects the scheduler into the linked target root's leaves (see "Detour")
    locationId?: string | null,   // null = "Anywhere"
    useParentLocation: boolean,   // inherit from category or ancestor instead
    categoryId?: string | null,
    color?, userId, createdAt, updatedAt
  }
  ```

  `PlannerType` is `task | plan | goal` (the old `habit` type is retired — flexible recurrence is now a capability of tasks/goals, and "Habit" is a tracking entity; see "Flexible recurrence" below). `EventType` (on `EventExtendedProps`) is `planner | template | travel | category | external` — the engine emits `travel`/`category` at runtime, and `external` marks read-only busy blocks imported from a connected external calendar (see "External calendars" below). The engine injects `external` blocks into its fixed-event fabric to carve slots around them, then filters both `external` and `template` back out of its assembled event list.

  **Sibling order** is `sortOrder`: a fractional float key local to each `parentId` group (append = max + 1024, insert = midpoint, reindex the group when a gap collapses — see [utils/goal-handlers/sortOrderKeys.ts](utils/goal-handlers/sortOrderKeys.ts)). The engine's flattened leaf order for a goal is the depth-first traversal with children sorted by `sortOrder` at each level (`getSortedTreeBottomLayer`). Reorder/reparent handlers live in [utils/goal-handlers/moveItem.ts](utils/goal-handlers/moveItem.ts) and touch only the moved row (plus the group on a rare reindex); with node-level dependencies they take an optional `MovePrecedenceGuard` — the proposed array runs `validateSubtreeOrder` before dispatch (skipped when the touched subtree carries no node-edge endpoint), and refusals surface through the DraggableContext's shared `ReorderRefusalBanner`. Inter-goal dependencies are a separate relation referencing Planner ids (`PlannerDependency`) — order and dependency are deliberately not one field.

  **Promote / demote** move a subtree across the root boundary, as native Redux mutations only (never through the AI draft contract — a root id matching a nested canonical row is deliberately re-minted there, which would orphan precedence references):

  - **Promote** ([utils/goal-handlers/promoteSubtree.ts](utils/goal-handlers/promoteSubtree.ts), "Promote to top level" in the subtasks EditDrawer footer with an informational confirm): breaks a subtree out as its own root. The row gets root conventions (`parentId: null`, `sortOrder: 0`, `isTriaged: true`, `linkedItemId: null`), the parent-chain-resolved category snapshotted on (root-only invariant), and a color (`own ?? old root's ?? deterministic fallback`). Childless → retyped to a ready `task`; with children → stays a goal, ready only when it carried readiness AND has a deadline, the resolved value cascaded over the subtree. An emptied old root gets the `deleteGoal` fixup (`isReady: false`). Inherited constraints/location are live-resolved, so promotion drops them by construction.
  - **Demote** ([utils/goal-handlers/demoteRootIntoGoal.ts](utils/goal-handlers/demoteRootIntoGoal.ts), "Nest under a goal" card in item-detail SideCards with a manifest confirm): nests a root as the LAST child of another root goal. Clears `categoryId` (own-value-first resolution would pin the subtree to the stale category) and `maxMinutesPerDay` (inert but the draft contract would heal it), stamps the TARGET root's readiness over the whole demoted subtree, keeps `plannerType`/`duration`. Queue membership and inbound detour links are dropped by the thunk's central pruning (the helper never prunes); dependency edges are PRESERVED as node-level edges — the helper refuses a demote that would manufacture a same-goal edge or close a loop through the target's step order (`buildDemoteLossManifest` feeds the confirm copy). Demote-then-promote does not round-trip dropped connections (immutable rows).

  ### Templates, plans, completed

  - **EventTemplate** — recurring weekly blocks (`startDay`, `startTime`, `duration`, optional `locationId`). May carry per-occurrence exceptions: `EventTemplate.recurrenceExceptions` (JSON `PlanOccurrenceException[]`, reusing the generic exception helpers in [utils/planRecurrence.ts](utils/planRecurrence.ts) — `moved`/`deleted`, keyed by the occurrence's original local start; a `moved` entry carries an optional `durationMinutes` for a per-occurrence resize). Created by dragging/resizing/deleting a single occurrence on the main calendar (templates are now interactive there → the same `RecurrenceScopeModal` scope prompt as plans, now including a **resize** scope: "just this occurrence" writes a `moved` exception carrying the dragged length while keeping the series duration, "every occurrence" edits the series `duration`; "every occurrence" on a move rewrites the template's day/time and clears exceptions). The engine applies them in `masksToIntervals` ([utils/calendar-generation/utils/intervalUtils.ts](utils/calendar-generation/utils/intervalUtils.ts)) and the calendar reflects them via `exdate` + one-off moved events ([templatesToEventInput](utils/calendar-rendering/templatesToEventInput.ts)); exceptions are listed with Restore in the WeekStructureModal TemplateEditor rail.
  - **plan** — a Planner row with `plannerType: "plan"` and a fixed `starts` timestamp. Anchors the calendar. A plan may **recur**: `Planner.recurrence` (JSON `{freq: daily|weekly|monthly, interval, until}`, edited in the item-detail "Repeats" section) expands into one concrete occurrence event per repetition, materialized by the engine with deterministic composite ids `` `${planId}|${localStartKey}` `` (CategoryEvent pattern; bounded by `PLAN_RECURRENCE_WINDOW_DAYS`/`MAX_PLAN_OCCURRENCES`). `Planner.recurrenceExceptions` (JSON array) holds per-occurrence overrides — `moved` (new start, keyed by the occurrence's original local start, key survives re-moves) and `deleted` — created from the calendar via scope prompts (drag or delete an occurrence → "just this occurrence / every occurrence"); they're listed with restore actions in the item-detail Exceptions card. Series-level edits: "every occurrence" moves shift `starts` by the drag delta and shift exception keys with it. All of this lives in [utils/planRecurrence.ts](utils/planRecurrence.ts); anything resolving a planner row from an event id must go through `plannerIdFromEventId` (occurrence ids are composite).
  - **completed** — any task/goal with `completedStartTime` / `completedEndTime` set. Rendered at the actual completion window, not the originally-scheduled one. Completion does not apply to plans: a plan always renders at its `starts` anchor and is excluded from the dashboard's uncompleted rollover list. Because the item-detail type picker can retype a completed item to plan (leaving stale completion times on the row), completion checks are type-aware — `plannerIsCompleted` / `plannerCompletedEnd` in [utils/plannerCompletion.ts](utils/plannerCompletion.ts) — rather than trusting the timestamps alone.
  - **split tasks** — a task (or goal subtree leaf; never a plan) with non-null `Planner.splitting` (JSON `{minMinutes, maxMinutes, maxMinutesPerDay?, minSpacingMinutes?}`, item-detail "Split into chunks" section) is placed by the engine as **dynamically sized chunks** instead of one block. Chunk sizes are decided per placement from the selected slot's real headroom via `ChunkSizing` threaded through the 5-phase pipeline (fit-test at min, grant up to max/day-budget), under the carving invariant that the leftover remainder is always zero or ≥ min — a remainder under `2*min` places whole, exceeding max if it must (surfaced as `SPLIT_CONSTRAINT_RELAXED`; the day cap is only relaxed by the final compromise pass after the expansion budget is spent). `minSpacingMinutes` (optional) forces at least that long a break between consecutive chunks of the same task (and after its latest completed segment); default none = chunks sit only the standard placement buffer apart, like any two dynamic placements. Chunk events are engine-materialized with composite ids `` `${plannerId}|chunk:${n}` `` and are **never memoized** — an uncompleted past chunk vanishes and its minutes reschedule. Completion is per-chunk: the calendar popover's Complete appends the chunk's window to `Planner.completedSegments` (JSON `[{start, end}]`); completed minutes are always **derived** by summing segments, each segment renders frozen as `` `${plannerId}|done:${segmentStart}` ``, and the task **auto-completes** when segments cover its duration. A splittable goal leaf runs its chunk loop to exhaustion and the next leaf chains after the last chunk. All helpers live in [utils/taskSplitting.ts](utils/taskSplitting.ts); the chunk loop is [scheduleSplitTask](utils/calendar-generation/helpers/Scheduler/scheduleSplitTask.ts). The AI assistant can manage it: `splitting` rides the DraftNode contract (`update_items` patch — object enables/adjusts, null clears, rejected on parents and plans; `add_items`/`propose_goals` nodes carry it like deadline/priority, so a retained node re-emitted without it clears it); `completedSegments` is never part of the draft contract.
  - **goal daily cap** — a goal root with non-null `Planner.maxMinutesPerDay` (Int, item-detail "Daily limit" section, goal roots only) has its whole subtree metered against one per-day ledger: the engine places at most that many minutes of the goal's leaves on any local day, spreading the rest across days. Implementation mirrors the split-task day cap one level up ([goalDayCap.ts](utils/calendar-generation/helpers/Scheduler/goalDayCap.ts)): the flat scheduler seeds the ledger once per run from pre-existing events (completed leaves, completed split segments, memoized past events — all in `scheduledEvents` before dynamic placement), then plain leaves ride the existing `ChunkSizing.dayBudget` seam with a fixed-grant sizing (place whole under budget or try another day) and split leaves compose the goal budget with their own via pointwise min, charging both ledgers per chunk. A detour target's leaf is metered by every capped root it belongs to (host + target): budgets compose pointwise-min over the caps the block fits, every placement charges every ledger, and oversized handling is per cap (a block bigger than one goal's cap is `oversizedLeaf` for that goal only — the others keep steering). Relaxation is two-tier: scarcity stays strict through horizon expansion and is only relaxed by the final compromise pass, while a block that can NEVER fit under the cap (leaf duration or min chunk > cap) places whole immediately — both surface as `GOAL_DAY_CAP_RELAXED` engine messages (kinds `oversizedLeaf` / `dayCap`, coalesced per goal+kind; `capMinutes` is an emit-time fact outside the id). Budget tests key on the slot's start day; midnight-crossing placements charge each day (split-task parity). Stale caps on retyped/nested rows are inert — the day cap applies only to root goal candidates (and detour-target roots). The AI assistant manages it as the "daily limit": `maxMinutesPerDay` rides DraftNode top-level goal roots only (splitting-style null contract — a retained goal re-emitted without it clears it, no mergeDraftForest backfill; `update_items` sets/clears it, rejected on children, tasks, and plans).
  - **scheduling constraints** — tasks and goals (never plans) carry two optional per-item placement bounds, both editable in item detail and both **inherited down the tree** (a leaf is bound by its own values AND every ancestor's): `Planner.earliestStartDate` (ISO — the engine never places the item before this instant; item-detail "Earliest start" picker) and `Planner.allowedTimes` (JSON `{days, ranges}` — weekday whitelist (0=Sunday, all-seven normalizes to null) and/or time-of-day spans applying on each allowed day; spans follow the category-window wrap convention: `endTime <= startTime` runs overnight anchored to the start day, `"23:59"` is the end-of-day sentinel; item-detail "Allowed times" section with day chips + span rows). Helpers live in [utils/allowedTimes.ts](utils/allowedTimes.ts) (parse/serialize/normalize, interval intersection, weekly max-block); the engine resolves constraints once per run in [buildPlannerConstraintsMap](utils/calendar-generation/helpers/CalendarGenerator/buildPlannerConstraintsMap.ts) (earliest = max over chain, allowed = list of settings intersected interval-wise). Placement: the earliest date rides the same `afterTime` seam goal-leaf chaining uses (`findValidSlots`), allowed times clip each candidate slot into allowed sub-fragments inside `findAllFittingSlots` (one slot may yield several; the whole `[travel][task][buffer]` unit lands inside a fragment), travel absorb/reclaim in `selectBestSlot` validates the back-extension per candidate instead of skipping constrained tasks — a redundant leg is ALWAYS removed for a same-location follow-up, and the task slides into the freed span only when the slid start still satisfies the `effectiveAfter` bound and stays inside the candidate's allowed interval (`slideIntoFreedTravel: false` otherwise: task keeps the clipped start, freed span stays free time), and `maxAllowedBlockMinutes` caps the `effectiveCapacityBreakdown` facts at both TOO_LARGE gates so a duration no allowed block can host fails loud instead of burning the expansion budget; when the item is ALSO window-constrained, `maxConstrainedBlockMinutes` (same file) takes the true weekly intersection of the allowed-times pattern and the eligible category windows — a structurally empty intersection (windows Monday, allowed times Tuesday) permanently fails the leaf as `IMPOSSIBLE_CONSTRAINTS` (surfaced through the `TASK_UNSCHEDULABLE` engine message), and a small one tightens the TOO_LARGE gate (the check is skipped when an eligible window carries per-occurrence exceptions, since a moved occurrence can land inside the allowed times), and `maxTemplateConstrainedBlockMinutes` ([capacityCheck.ts](utils/calendar-generation/helpers/Scheduler/capacityCheck.ts)) folds the week's TEMPLATE structure into both remaining axes — the largest clean-week fragment of template-free gaps ∩ the allowed pattern ∩ the eligible window occurrences, minus the trailing placement buffer the fit-test demands inside the same fragment, run whenever the item carries allowed times OR eligible windows — so a block that fits every pair of axes but no combined fragment (exactly matching its largest fragment and failing by the buffer margin, windows fully template-covered, or the three-way empty triple) fails loud as TOO_LARGE instead of burning the expansion budget and starving everything queued behind it. Its guards each err toward a larger ceiling (per-day sampling cannot see fragments chaining across midnight): an overnight allowed range drops the allowed axis, an overnight eligible window drops the window axis, and a template whose per-occurrence exceptions can touch a day the remaining axes care about skips the check. `leafStructuralCapacity` (same file) composes every ceiling into the one per-leaf number consulted identically by placeLeaf's TOO_LARGE/IMPOSSIBLE_CONSTRAINTS gate AND the expansion watermark's sizing loop — sizing the watermark on a looser ceiling would let a leaf only an intersection gate can fail pin `biggestFit < biggestRemaining` and burn the whole expansion budget before its first attempt — and records WHICH ceiling won as `limitingAxis`, riding the `TASK_TOO_LARGE` payload so the console names the exact constraint (see Engine messages). Split tasks and goal day caps compose transparently — chunks land inside allowed fragments because `scheduleSplitTask` copies the parent row's constraints-map entry onto each chunk's composite id (the pipeline resolves constraints by event id, like location/category). The AI draft contract carries both fields **per-node** (any depth, inherited down the tree — unlike the root-only `categoryId`/`color`/`maxMinutesPerDay`): `DraftNode.earliestStartDate` (ISO string, like deadline) and `DraftNode.allowedTimes` (the parsed `{days, ranges}`, like splitting), emitted by `buildDraftNode` for every task/goal node (null on plans), settable via `update_items`/`add_items`/`propose_goals`, validated tasks/goals-only, applied with splitting-style null semantics (a retained node re-emitted without one clears it) and serialized to the string columns in `applyDraftForestToPlanner`. So they now survive delete+recreate/cross-goal moves; the assistant never exposes the field names to the user (plain-language "earliest start" / "allowed times").

  ### Precedence — queues (pipes) and dependencies

  Two user-facing concepts, one engine representation (`PrecedenceEdge {fromId, toId, source: "queue" | "dependency", queueId?}`); full design in [notes/precedence-plan.md](notes/precedence-plan.md):

  - **Queue** — a first-class entity (`Queue` + `QueueMember` rows, NOT a plannerType): a persistent ordered list of references to root-level triaged tasks/goals, managed at `/queues`. Members schedule in FIFO order — each bounded to start after the previous member's last placed end. A planner belongs to at most one queue (DB unique on `QueueMember.plannerId`). Member order is a fractional `sortOrder` ([utils/queue-handlers/sortOrderKeys.ts](utils/queue-handlers/sortOrderKeys.ts)); ALL member writes go through the one cycle-validated choke point [utils/queue-handlers/mutateQueueMembers.ts](utils/queue-handlers/mutateQueueMembers.ts). A queue's optional `categoryId` is an **inherited default**: categoryless root members adopt it at the engine's input boundary ([applyQueueCategoryInheritance](utils/calendar-generation/helpers/CalendarGenerator/applyQueueCategoryInheritance.ts)) and in UI badges (`getEffectiveCategoryId`'s optional `queueCategoryByRootId` + [utils/queue-handlers/queueLookups.ts](utils/queue-handlers/queueLookups.ts)).
  - **Dependency** — a prerequisite edge (`PlannerDependency`, immutable rows) between **any non-plan nodes whose structural roots are triaged** — subtask→subtask across goals, goal→subtask, subtask→goal, root→root. Authored in the item-detail Connections card via a search/browse picker modal ([DependencyPickerModal](app/(protected)/items/[id]/_components/DependencyPickerModal/DependencyPickerModal.tsx): breadcrumb hierarchy per option, prohibited options ghosted with the reason — "same goal — order is set by the list" / "would create a loop" — via ONE reverse-reachability DFS per open, commit hard-checked regardless). **Same-goal edges are banned outright** (a goal's leaves are already totally ordered by sibling order; root↔own-subtask included). Queue members and detour targets keep the root-only rule forever. Multi-predecessor: a successor starts after the max end across all placed predecessors. The shared endpoint predicates live in [utils/precedence/endpoints.ts](utils/precedence/endpoints.ts) (`isValidPrecedenceEndpoint` root-shape for queues/detours, `isValidDependencyEndpoint` node-shape for dependencies — every layer consumes these, never a local copy). No container entity — the connected component IS the "project"; no Project model, ever.
  - **Validation vs gating — deliberately two graphs.** Cycle legality is authoring-time only, checked against the union of dependency edges and each queue's FULL logical member order ([utils/precedence/validationEdges.ts](utils/precedence/validationEdges.ts) + [findCycle.ts](utils/precedence/findCycle.ts)) — completed/unready members still count, so un-completing can't resurrect a latent cycle. With node-level edges the legality graph lives at LEAF granularity: every endpoint expands to its subtree's boundary leaves (predecessor → last leaf, successor → first leaf; a childless node is its own bottom layer) and each root's internal step order joins as consecutive-pair `internal` edges (completed leaves included) — a reorder can close a loop through TWO goals' internal orders even when every edge is individually legal, so `validateSubtreeOrder` guards subtask drags, demotes, and the assistant's `move_item` (cheap skip when the touched subtree carries no node-edge endpoint). Detour components contract with every subtree node resolving through its structural root; internal self-loops from contraction drop, queue/dependency self-loops stay (genuine deadlock). `describeCycle` renders internal hops as "through <goal>'s step order". The engine's gated builder ([helpers/Scheduler/precedenceEdges.ts](utils/calendar-generation/helpers/Scheduler/precedenceEdges.ts)) applies TRANSPARENCY instead: completed members/predecessors (nodes included) carry no bound, unready-goal queue members chain through silently, unready-rooted dependency predecessors flow to the gate so the fallback is loud. Do not unify the two.
  - **Engine gate** ([precedenceGate.ts](utils/calendar-generation/helpers/Scheduler/precedenceGate.ts), folded into `scheduleTasksAndGoals`): outcomes are ANCHOR-keyed — root ids for queue edges, any node id for dependency edges. A node endpoint registers as a gate anchor in [buildLeafGraph](utils/calendar-generation/helpers/Scheduler/buildLeafGraph.ts) (its first own leaf carries the cross gate, its leaves feed its outcome, boundary leaves ride the score lift with the successor's ROOT urgency — anchors share the roots' completion tracking but `goalCapFor` filters nested rows so a stale day cap on a nested goal row stays inert). Absent predecessors seed before the loop (completed node → `plannerCompletedEnd`; memoized/past subtree events → max end; node under an unready CONTAINING ROOT → `unready` — resolved by walking to the root, not the endpoint row's own type); leaves with blocked chains or gates are excluded from watermark sizing, and the zero-attempt deadlock escape force-fails missing anchor outcomes so stale data can't burn the expansion budget. Permanent predecessor failure → successors schedule unbounded + `QUEUE_SEQUENCE_BROKEN` / `DEPENDENCY_BROKEN` (cause `failed`/`unready`; endpoint ids ride in the message identity so a node break and a root break on the same pair never coalesce, and [renderEngineMessage.ts](utils/renderEngineMessage.ts) renders interior endpoints as `"Step" (a step of "Goal")`); pure budget exhaustion → `SEQUENCE_PAST_HORIZON` instead. The bound rides the existing `afterTime` seam, so `findValidSlots` composes it with `earliestStartDate`/`allowedTimes` for free.
  - **Redundant same-pipe dependencies are allowed**; contradictions are blocked with the closing path shown ([describeCycle](utils/precedence/describeCycle.ts)). Central pruning ([utils/precedence/prunePrecedenceInputs.ts](utils/precedence/prunePrecedenceInputs.ts), run in the calendar thunk) drops queue members/detour links whose planner was deleted/retyped/nested/untriaged; dependency edges use the node predicate (dropped only when an endpoint is gone, plan-typed, or its structural root untriaged/plan-typed — a nested endpoint under a triaged root is valid); completed + unready stay (valid transparent links).
  - **Graph view** (`/graph`): the timeline surface — queues render as lanes whose members weave over-under in member order (two alternating rows, so back-to-back placements don't touch and read as one bar) and dependencies as arrowed connectors over a horizontal time axis, with per-root forecast spans derived from the engine's placed events ([buildRootSpans](app/(protected)/graph/_lib/graphModel.ts): event → planner via `plannerIdFromEventId`, root via parent walk; zero engine changes; completed-segment events on a goal-typed row WITH children — a splittable task later retyped into a goal — are excluded from both span builders as stale calendar history, while a childless split row's segments keep counting). A queue lane is tinted with its accent — `Queue.color` (nullable column, picked via `PopoverColorPicker` in the queues-page header) falling back to the queue's category color — and its title carries an inline "Queue:" kicker prefix (so a queue never reads as a same-named category heading); member order reads implicitly (lane membership + left-to-right time), so chain connectors draw only for an out-of-order pair (dashed error). A category-attached queue nests under that category's heading in the tree walk, indented one level like a subcategory (a category whose only content is an attached queue still renders as a header lane); queues with no category stay as top lanes. Non-queue root goals and dependency-endpoint tasks group under an **indented category tree**: one lane per category holding items (greedy row packing), lanes ordered by a depth-first walk of the category hierarchy with headings indented per depth and a `CategoryDot`; an ancestor category whose items all live in subcategories renders as a compact header-only context lane (no separator, no count); items with no category land in a trailing "Uncategorized" lane. Unscheduled endpoints dock past the domain edge under a "Not scheduled" axis label; a successor placed before its predecessor's end renders as a dashed error connector. Nodes are pills carrying the item's color as a 3px left accent border (deliberately NOT a tinted fill), and their height follows the zoom (log-scaled 18–30px via `nodeHeightForZoom`; min width = height, so a fully squished node clamps to a circle at every zoom level); titles render as much as fits with an ellipsis; below ~40px wide only the first letter stays while the node is tall enough (≥22px). Hovering ANY node shows a floating detail badge (title + scheduled window + duration) that replaces the native browser tooltip — no `title` attribute on nodes — toggleable via the "Hover labels" switch. A header "Leaf tasks" toggle switches to the **leaf view**: an item whose placements go beyond its own block expands into a band — a compact root card on top (title-fit width, `bandRootHeight` tall), a grouping brace, and its placed bottom-layer leaves as pills below (per-leaf spans from `buildLeafSpans`, chunk/segment events aggregated per leaf) — with each band on its own row (never overlapping other items), reorder dragging staying on the root pill, link handles moving to the leaf pills (still creating root-to-root dependencies), and edges anchoring to the last/first leaf — the engine's actual bound; single-block items and the root view render exactly as before. Writes reuse the existing seams by construction: dragging either edge handle of a node onto another node adds a dependency — the right handle makes the source the predecessor, the left handle makes the drop target the predecessor (`wouldCreateCycleAddingDependency` live-validated during the drag, refusals banner `describeCycle`'s path) — dragging a member sideways within its lane reorders through `reorderQueueMember` (drop-index math runs against the FULL member order, completed included, like QueueMemberList) — pointer-driven like the link handles, never HTML5 DnD (which forces OS drag cursors and a snapshot ghost): the grabbed node itself follows the cursor x-locked with a live bubble preview (lane nodes translate to the anchor slots of the previewed order, a dashed slot marks the landing anchor, Escape cancels), and on release the preview HOLDS until the regen's layout lands so nodes ease straight from previewed to real placements (node position transitions disabled while zooming, plus a delayed edge fade-in) — and clicking a connector opens an inspect/remove chip. Node category accents resolve through CalendarProvider's shared `queueCategoryByRootId` lookup. A logarithmic zoom slider (6–960 px/day — the top of the range reaches hour granularity) keeps the viewport's center time fixed while zooming, pinning to the domain start instead while the viewport touches the far left; the canvas remaps the wheel (plain wheel pans the timeline, shift+wheel scrolls vertically, ctrl/meta+wheel and trackpad pinch zoom anchored at the cursor — attached as a native non-passive listener because React root wheel handlers are passive). Vertical time markers are per-unit (hour/day/week/month), individually toggleable via the header "Markers" popover (`MarkerMenu`), auto-hidden while their spacing is illegible (lines <10px apart; labels per-unit) with a boundary day belonging to the coarsest visible unit; hour ticks are viewport-windowed (quantized scroll window) so a season-long domain never emits tens of thousands of DOM nodes. `layout.scheduleEndX` marks where the engine's placements end — rendered as a dashed delimiter line plus a faint ink wash over everything beyond it. The canvas fills the card height (the space under the last lane reads as an unnamed row); show-completed toggle (completed hidden by default). A header "Standalone tasks" toggle (`showLooseTasks`, default off) admits root-level triaged tasks with no queue or dependency involvement as independent nodes — by default the independent lanes show only root goals and dependency-endpoint tasks.
  - **Readiness gate**: a goal can't be readied while a dependency predecessor sits under an unready goal root ("Awaiting <title>", three-dot popover with Ready/Disconnect shortcuts); un-readying a goal a READY goal depends on is refused symmetrically ([utils/precedence/readinessBlockers.ts](utils/precedence/readinessBlockers.ts), enforced in ItemDetailLayout). Node-level edges resolve through the endpoint's CONTAINING ROOT (a task-typed subtask under an unready goal blocks; edges into a goal's SUBTREE gate the goal; completed endpoints are transparent), and interior blockers render "part of <root>" with the Ready shortcut withheld (readiness cascades from roots only). The assistant has full precedence read/write (see the AI-assistant section — same validators, draft ids remapped at Save); `applyDraftForestToPlanner` still clamps `isReady: true` to false on blocked goals at save time (fixed-point, cascades the subtree; node edges into the subtree count via the generalized helper), and handleSave re-runs the clamp after the precedence apply so assistant-created edges gate too.
  - **Graph view rendering of node edges** is root-fallback in v1: a node endpoint with no pill of its own anchors to its ROOT's pill (or the exact leaf pill when the leaf view has one placed), and out-of-order error styling is suppressed for node edges (root spans don't stand in for a node's own window). Graph-side node-edge authoring is deferred; the drag-to-link handles still create root-to-root edges.
  - **Assistant boundary (v1)**: `add_dependencies` stays root-only (its refusal names the UI as the authoring surface for node edges), but the draft layers never destroy user-authored node edges — the working-copy prune and save apply use node predicates ([draftPrecedence.ts](utils/draft/draftPrecedence.ts) `isDraftDependencyEndpoint`, [applyDraftPrecedence.ts](utils/draft/applyDraftPrecedence.ts)), `move_item` refuses reorders that close a loop (`draftValidateSubtreeOrder`), endpoints remap through the all-levels `nodeIdMap`, and the save path's final defense drops node-level dependency edges (never planner rows) if a propose_goals restructure closed a loop.

  ### Detour (goal-as-subtask link)

  A **detour** splices one goal/task's work *inside* another goal's sequence (interleaving, unlike a plain dependency). Data model: one nullable column `Planner.linkedItemId` (self-FK, `onDelete: SetNull`) on a **placeholder subtask** — a normal subtask that, once linked, becomes a **redirect**: the engine splices the linked *target* root's leaves in at that position and ignores the placeholder's own duration (children added under a placeholder still schedule, after the splice). The scalar is the whole model; the columns ride the existing planner sync/diff/spread-preserve machinery ([plannerHandlers.ts](actions/calendar-actions/sync-handlers/plannerHandlers.ts) bulk-update column list) with no new plumbing.

  - **Engine.** The scheduler is flat-order (see the engine summary): candidate roots are flattened to a single leaf pool. [getScheduledLeafSequence](utils/goalPageHandlers.ts) is the detour-aware DFS enumerator (a `linkedItemId` node redirects into the target's sequence, deduped + cycle-guarded; a TASK entry — walk root or redirect target — stands for its own block, its children being independent candidates); the SCHEDULER uses it, structural walks (`getTreeBottomLayer` / deletion / counts) never follow links. The splice is **transparent for unready or completed targets** (readiness is the universal gate; completed work never reschedules) — the host chain flows through the placeholder, and an unready target that is also a dependency predecessor still surfaces the loud `DEPENDENCY_BROKEN(unready)` fallback. [buildLeafGraph](utils/calendar-generation/helpers/Scheduler/buildLeafGraph.ts) turns each candidate's spliced sequence into consecutive-pair chain edges — one construct that encodes goal-internal chaining, detour splices, AND **multi-reference** (a target referenced from several placeholders lives once in the pool with chain predecessors from all of them). Targets spliced by an ACTIVE candidate are excluded from independent candidacy ([prepareCandidates](utils/calendar-generation/helpers/CalendarGenerator/prepareCandidates.ts) collects the followed set from the enumerator walks) — a target whose every host is completed/unready/inactive schedules independently; an actively spliced target's own root-level outcome is still tracked (it may be a queue/dependency endpoint). Day caps apply per capped root the leaf belongs to (host + target): budgets compose pointwise-min over the caps the block FITS, every placement charges every ledger, and a block bigger than one goal's cap is `oversizedLeaf` for that goal only while the others keep steering. Leaf-level priority inheritance means a host's *before*-leaves inherit the spliced target's score while *after*-leaves don't. Deliberate v1 semantics: the host's `earliestStartDate`/`allowedTimes` do NOT reach spliced leaves (constraints resolve over the structural parent chain; the target's own constraints bind) — the day cap is the one host property that composes across the link.
  - **Validation + pruning.** Authoring rules in [utils/precedence/detourLinks.ts](utils/precedence/detourLinks.ts) (`canLinkAsDetour` / `wouldCreateDetourCycle` / `isValidDetourTarget`): target must be a triaged root task/goal, not self, no detour cycle, and no queue/dependency path connecting host and target in either direction (the splice makes them mutually ordered — such a pair would deadlock at runtime). Detour links join the queue/dependency cycle validators via **component contraction** ([validationEdges.ts](utils/precedence/validationEdges.ts) `detourComponentMap` + `contractPrecedenceEdges`): host and spliced target are one node for legality, so dependency adds, queue member adds/reorders ([findCycle.ts](utils/precedence/findCycle.ts) wrappers take the planner array), and the assistant's save-time defense ([applyDraftPrecedence](utils/draft/applyDraftPrecedence.ts)) all refuse edges that connect a detour component to itself. The engine additionally force-fails deadlocked gates from stale contradictory data instead of burning its expansion budget. Central pruning `prunePlannerDetours` ([prunePrecedenceInputs.ts](utils/precedence/prunePrecedenceInputs.ts), run in the thunk) clears a stale `linkedItemId` (deleted/nested/untriaged target) so the sync transaction never writes a link to an about-to-be-deleted row.
  - **UI.** "Link external item" picker in the subtasks [EditDrawer](app/(protected)/items/[id]/subtasks/_components/EditDrawer/EditDrawer.tsx) (cycle-blocked targets annotated + hard-checked, queue/dependency contradictions included); reverse "Linked into" card on the target in [SideCards](app/(protected)/items/[id]/_components/SideCards/SideCards.tsx). v1 limitations: the assistant can't author detours (the columns survive on retained rows via spread-preserve, like `earliestStartDate`) and its op-time precedence validators can't see links (the save-time defense catches contradictions); the subtasks tree renders a placeholder as an ordinary row (the drawer reveals the link) — a distinct redirect row is a follow-up.

  ### Location & travel

  - **Location** — name, address, Google `placeId`, lat/lng. `null` locationId means **"Anywhere"** (no travel needed).
  - **TravelTime** — directional, per-transport-mode (`DRIVING | TRANSIT | BICYCLING | WALKING`), with Google baseline values (`rushHour | regular | night`) and optional user overrides.
  - **TravelEvent** — engine-materialized row written wholesale on each regen with a deterministic id (`${fromId ?? "anywhere"}-${toId ?? "anywhere"}-${start}`). Carries `insufficientTravel` / `overconstrained` markers.

  ### External calendars (imported feeds)

  A user can subscribe to outside calendars so the scheduler works around commitments it doesn't own. The domain lives in [prisma/schemas/models/externalCalendar.prisma](prisma/schemas/models/externalCalendar.prisma), the pure logic in [utils/external-calendar/](utils/external-calendar/), and the server surface in [actions/externalCalendars.ts](actions/externalCalendars.ts) + [actions/googleCalendar.ts](actions/googleCalendar.ts) + [actions/microsoftCalendar.ts](actions/microsoftCalendar.ts). All of it is **outside the OCC diff sync** — direct actions that mirror results into the `externalCalendar` Redux slice (like `viewState`), so importing a calendar never bumps `dataVersion`.

  - **ExternalCalendarSource** — a per-user connected source: `kind` (`ICS | GOOGLE | MICROSOFT`), `url` (feed URL for ICS, provider `calendarId` for GOOGLE/MICROSOFT), `name`, `color?`, `enabled`, `mode` (`BUSY | VISUAL`, default `BUSY`), `modeExceptions` (JSON `string[]` of provider event UIDs whose busy/visual behavior flips the source default), `lastFetchedAt?`, `lastError?` (cleared on the next successful refresh). Cascade-deleted with the user.
  - **ExternalEvent** — a materialized imported occurrence with a deterministic composite id `` `${sourceId}|${uid}|${occurrenceStartISO}` `` (the CategoryEvent / plan-occurrence pattern). Carries `uid` (provider UID — **series-level** for recurring events, so one exception covers a whole series), `title`, `start`, `end`, `allDay`. Cascade-deleted with its source.
  - **GoogleCalendarConnection** — one per user (`@unique userId`): the offline OAuth grant (`refreshToken` exchanged for a short-lived access token per fetch) plus display `email`. Deliberately **independent of the login provider** so credentials users can connect a Google account too; revoked + deleted on disconnect.
  - **MicrosoftCalendarConnection** — the Microsoft counterpart (same shape, [microsoftGraphApi.ts](utils/external-calendar/microsoftGraphApi.ts)), with two provider differences: Microsoft **rotates refresh tokens** — every token refresh returns a new one, persisted immediately by `getMicrosoftAccessTokenForUser` in [externalSourceServer.ts](utils/external-calendar/externalSourceServer.ts) (all Graph calls go through it) — and there is **no programmatic revoke** for consumer grants, so disconnect deletes the local copy and the UI points the user at their Microsoft account's app permissions.
  - **Three connection paths.** (1) **ICS feed URL** — paste a URL in Settings → Integrations; `normalizeIcsUrl` accepts `https`/`webcal` (webcal rewritten), the server fetches it (15s timeout, 10MB cap), and `parseIcsFeed` (node-ical, server-only) expands recurrences (overrides + EXDATEs applied) into concrete occurrences. A pasted Google *sharing* link resolves its `cid` to a `calendarId` and falls back to the public `.../public/basic.ics` feed. (2) **Google OAuth** — `GET /api/integrations/google/connect` sets a CSRF state cookie and redirects to Google's consent screen (scope `calendar.readonly`, `access_type=offline`); the `callback` exchanges the code, stores the refresh token, and redirects to `/settings?google=…`. Connected users pick calendars from the API and add them as `GOOGLE`-kind sources. (3) **Microsoft OAuth** — same shape via `GET /api/integrations/microsoft/{connect,callback}` (common-tenant `login.microsoftonline.com`, scope `Calendars.Read` + `offline_access`, redirects to `/settings?microsoft=…`); connected users pick from `/me/calendars` and events come from Graph `calendarView` (occurrences pre-expanded, fetched with `Prefer: outlook.timezone="UTC"`, `seriesMasterId` as the series-level uid) as `MICROSOFT`-kind sources.
  - **BUSY vs VISUAL.** A `BUSY` source's events block the scheduler; a `VISUAL` source is overlay-only. `modeExceptions` flips individual events against the source default (the calendar popover's "Blocks scheduling" switch toggles one UID via `toggleExternalEventBusyException`). [deriveExternalBusyEvents](utils/external-calendar/deriveExternalBusyEvents.ts) resolves which imported events actually block (`busyByDefault !== excepted`, timed only, end > start) into `SimpleEvent`-shaped blocks stamped `eventType: external`. These are **derived fresh per engine run** (in the thunk + `useManuallyRefreshCalendar`), passed as `options.externalBusyEvents`, joined onto the engine's fixed-event fabric before slot building so slots carve around them, and filtered back out of the persisted output at final assembly — so a mode/exception/enabled change takes effect on the next regen with no reload. The engine never persists them; they live only in `ExternalEvent` rows owned by the refresh path.
  - **Freshness + rendering.** [refreshPolicy.ts](utils/external-calendar/refreshPolicy.ts) sets the expansion window (30d past / 180d future); CalendarProvider's once-per-load bootstrap (login redirect and hard refresh both land there) hydrates the slice then refreshes every enabled source before one regen — no TTL gate. On the main calendar, imported events render as a **read-only overlay** via `externalEventsToEventInput` + [ExternalEventContent](components/events/ExternalEventContent/ExternalEventContent.tsx)/[ExternalEventPopover](components/events/ExternalEventPopover/ExternalEventPopover.tsx) (all-day rows never render and never block in v1; the popover carries a per-source Refresh action alongside the busy toggle). Management UI is **Settings → Integrations** ([IntegrationsSection](app/(protected)/settings/_components/IntegrationsSection/IntegrationsSection.tsx)): add-by-URL, Google and Microsoft connect/disconnect + calendar pickers, and a per-source BUSY/VISUAL toggle, color, enable, refresh, remove.

  ### Flexible recurrence (repeating tasks and goals)

  There is **no habit planner type** (retired by `retire_habit_type_add_habit_trackers` — old habit rows were retyped to tasks with everything preserved). Instead, **any top-level task or goal may carry a flexible repeat rule**: `Planner.recurrence` `{freq,interval,until}` on a non-plan root means "schedule one auto-placed occurrence per period" ("clean ~60min sometime Fri/Sat, weekly"; "meditate 20min every morning"), composed with the item's own `allowedTimes`/`earliestStartDate`/`duration` (+ optional `splitting` `{minMinutes,maxMinutes}` reinterpreted as bounds for a **single flexible block** per occurrence, never the multi-chunk split loop — `taskIsSplittable` returns false for recurring rows and occurrence clones). The shared predicate is [plannerHasFlexibleRecurrence](utils/planRecurrence.ts) (task/goal + parseable rule; root-only in effect — nested values are inert and healed by the assistant apply), and `isRecurrenceOccurrenceId` is the strict occurrence-id test (`${plannerId}|${occurrenceKey}` where the key matches the local wall-clock shape — chunk `|chunk:n` and segment `|done:` ids never match). Recurring items are never wholesale-"completed" (`plannerCompletion` early-returns like plans), hide the Deadline field (mutually exclusive — each occurrence derives its deadline from its period end; the item-detail RecurrenceSection shows for plans + non-plan ROOTS and clears the deadline on enable), can't be queue members / dependency endpoints / detour targets ([endpoints.ts](utils/precedence/endpoints.ts) excludes them like plans), and satisfy the goal readiness gate in place of a deadline (subtasks + deadline OR repeat rule). "Delete just this occurrence" on the calendar writes a `deleted` recurrence exception whose period is then skipped by BOTH scheduling and stats ([enumerateRecurrencePeriods](utils/recurringPeriods.ts)).

  - **Period model** ([utils/recurringPeriods.ts](utils/recurringPeriods.ts), shared by the engine and the stats layer so they can never disagree): periods step from the item's IMMUTABLE `createdAt` (snapped to day/month), deliberately independent of `weekStartDay` and `earliestStartDate` — an `OccurrenceCompletion` is bound to its period key, so deriving keys from mutable inputs would re-key the log. Keys are local wall-clock (`occurrenceKey`), weekly is a rolling 7-day window from the creation day.
  - **Engine (in-pool scoring, NOT a gap-filler).** [expandRecurringItems](utils/calendar-generation/helpers/CalendarGenerator/expandRecurringItems.ts) enumerates each recurring root's periods over a small horizon (`RECURRENCE_HORIZON_DAYS = 14`, at or below the initial slot horizon so every occurrence's window is materialized on the first slot build) and injects per-period **occurrence clones** into the SAME leaf pool / scoring as one-off work. A recurring TASK clones as one childless root (`${taskId}|${periodKey}`); a recurring GOAL clones its **whole subtree** per period — every node re-minted as `${nodeId}|${periodKey}` with parent pointers remapped into the clone tree, so ordinary goal machinery (leaf enumeration, sibling-order chaining, day caps via a raw-id match in `seedGoalDayLedger`, category/location inheritance) operates per period unchanged. Clones null `recurrence`/`linkedItemId`/row-level completion (completion derives EXCLUSIVELY from the log; leaves with a logged period are stamped completed so every downstream filter treats them like completed leaves); base recurring rows are filtered from candidacy in [prepareCandidates](utils/calendar-generation/helpers/CalendarGenerator/prepareCandidates.ts) (templates for their clones). Each clone root carries `deadline = periodEnd`, so `calculateTaskUrgency` scores it like a deadline-bearing task — whether it **places or is skipped ("missed") emerges from the same contest**. Constraints merge per clone in CalendarGenerator: the SOURCE row's resolved chain floored at max(period start, now) and capped by `placementWindowEnd` = period end (threaded through [findValidSlots](utils/calendar-generation/helpers/Scheduler/findValidSlots.ts) → [findAllFittingSlots](utils/calendar-generation/helpers/TimeSlotManager/findAllFittingSlots.ts)) — so week 1 and week 2 never both land on the nearest weekend. A `NO_SLOTS` on a materialized window is a **silent permanent miss** (occurrence `NO_SLOTS` failures are filtered; structural TOO_LARGE/IMPOSSIBLE remap+coalesce to the source row). Occurrences are excluded from memoization by id shape ([buildMemoizedEvents](utils/calendar-generation/helpers/EventAssembler/buildMemoizedEvents.ts)) so a past uncompleted one **vanishes** while a completed one re-derives from the log; recurring occurrences are also excluded from the EDF tier, fit-tightness scoring, and the polish pass.
  - **Occurrence-completion log (out-of-band, like `viewState`/external calendars).** `OccurrenceCompletion` rows (model renamed from HabitCompletion; table still `HabitCompletions`) keyed `@@unique([plannerId, occurrenceKey])` are written by direct actions ([actions/occurrenceCompletions.ts](actions/occurrenceCompletions.ts): log/unlog/get — **never bump `dataVersion`**), mirrored into the `occurrenceCompletions` Redux slice, hydrated by a CalendarProvider bootstrap, and fed to the engine each run via `deriveOccurrenceCompletions` → `options.occurrenceCompletions`. The log serves three shapes: recurring-task occurrences (row on the task id), recurring-goal LEAF periods (row on the leaf id — a period is done when every structural leaf is logged; fully-logged periods emit nothing), and **plan check-offs** ("did this actually happen?" — row on the plan id keyed by the occurrence's local start, or the anchor instant for one-offs; purely a record, the engine never reads plan completions and the dashboard rollover still excludes plans). [buildOccurrenceCompletedEvents](utils/calendar-generation/helpers/EventAssembler/buildOccurrenceCompletedEvents.ts) freezes recurring-item completions at their logged window (id-stable via `stabilizeEvent`; resolves rows through the structural root, skips plan rows and no-longer-leaf nodes). The calendar tile/popover Complete action ([EventContent](components/events/EventContent/EventContent.tsx)) routes occurrence tiles and plan tiles to the log (plans without a regen — the tile re-renders off the slice) and everything else to row-level completion.
  - **Habit trackers (the /habits surface).** A **Habit** is a pure TRACKING entity over **repeating** top-level planner items, grouped by **HabitBucket** — the habits surface's OWN grouping entity, deliberately distinct from the item Category tree. Models in [prisma/schemas/models/habit.prisma](prisma/schemas/models/habit.prisma): `HabitBucket` (name, optional `color`, `sortOrder`), `Habit` (name, optional `color`, `bucketId` SetNull — deleted buckets leave habits unsorted), `HabitItem` (`@@unique([habitId, plannerId])`, an item may feed several habits; only items whose recurrence parses are linkable — enforced in the actions and the picker, never the schema). The engine never reads any of it; all writes are direct actions ([actions/habits.ts](actions/habits.ts): getHabitData/bucket CRUD/habit CRUD/addItem/removeItem + the assistant's batch `applyHabitChanges`) mirrored wholesale into the `habits` Redux slice (never bump `dataVersion`). `/habits` ([HabitsClient](app/(protected)/habits/HabitsClient.tsx)) renders every bucket as a section (bucket order; empty buckets too; "Unsorted" trails) with create/edit/delete via [BucketModal](app/(protected)/habits/_components/BucketModal/BucketModal.tsx), and per habit: tracked-item chips (open/remove), the recurring-only picker ([AddHabitItemModal](app/(protected)/habits/_components/AddHabitItemModal/AddHabitItemModal.tsx) — triaged roots whose recurrence parses), and a **week-aligned month grid** (`habitGridWeeks` lays the 30-day window out as weekday-header + week rows on the user's `weekStartDay`; every completed occurrence of every linked item counts as ONE instance on its day — green circle, count inside when several, today ringed) with **non-trackable days grayed** via `HabitDayCell.expected` (a day is expected when a completion landed on it, a recurring plan occurrence falls on it, a daily-period rule covers it, or the engine scheduled an occurrence of a linked item there — weekly/monthly rules leave undetermined days gray, so misses read from the period stats, not the grid). Stats from [computeHabitTrackerStats](utils/habits/habitStats.ts): per-day counts from each tracked item's completion signal (recurring task → logged periods; recurring goal → periods whose EVERY leaf is logged, counted on the last leaf's day; recurring plan → check-offs), plus period-based rate/streaks graded ONLY when the habit tracks exactly one recurring item (no honest cadence otherwise — those habits show activity without a "missed" verdict). The "New habit" modal ([NewHabitModal](app/(protected)/habits/_components/NewHabitModal/NewHabitModal.tsx)) creates the tracker only (name + bucket) — repeating items are created separately (item detail / capture / assistant) and linked afterward. Deleting a habit never touches the tracked items. Tests: [recurring-item-scheduling](__tests__/calendar-generation/recurring-item-scheduling.test.ts) (engine, tasks + goal subtrees) + [habitStats](__tests__/utils/habitStats.test.ts) (tracker stats, expected days, week layout) + [draftHabits](__tests__/draft/draftHabits.test.ts) + [recurrenceContract](__tests__/draft/recurrenceContract.test.ts) (assistant contracts).
  - **Known limits.** "N times per week" (count per period) is one-per-period for now; recurring tasks with children schedule only the root's own block per period (children stay independent candidates); detour links inside a recurring goal are nulled on clones (splicing an external target into a repeating period would multiply-schedule it); a subtree edit after logged periods can misclassify old periods in stats (period completion checks CURRENT leaves).

  ### Category system

  - **Category** — hierarchical (`parentId`), with `icon`, `color`, `sortOrder`, `useTimeWindows`, `isStrict`, `confineToOwnWindows`, optional `locationId`.
  - **Roles vs. categories (user-facing wording).** Top-level categories (`parentId === null`) are surfaced to the user as **Roles** (Covey framing — the roles you play in life), everywhere they appear: the onboarding Roles step, the `/categories` page + editor + rail, and the nav label. Everything nested under a role stays a **category** ("sub-category" one level deeper). The **data model is unchanged** — it's all `Category` — and the **scheduling vocabulary stays "category"** deliberately (WeekStructureModal, the assistant's "category windows", `CategoryBadge`, the engine), because windows/strictness attach to categories at any depth. UI copy is level-aware via `isRole = !category.parentId`.
  - **CategoryTimeWindow** — one row per weekly occurrence (`day` 0–6, `startTime`/`endTime` `"HH:MM"`). `categoryId` is nullable so windows can exist as unassigned drafts; the engine ignores those. May carry per-occurrence exceptions: `recurrenceExceptions` (JSON `PlanOccurrenceException[]`, same generic helpers as plans/templates, keyed by the occurrence's original local start). Category blocks stay non-interactive on the main calendar (background events), so unlike templates there is NO calendar path to create their exceptions — they are created AND restored in the editors, both through the shared [WindowExceptionEditor](components/events/WindowExceptionEditor/WindowExceptionEditor.tsx) (upcoming-occurrence picker + Skip/Move + restore list): the WeekStructureModal WindowEditor rail (one selected window), and the /categories CategoryEditor via a "Manage exceptions" button that opens [CategoryExceptionsModal](app/(protected)/categories/_components/CategoryExceptionsModal/CategoryExceptionsModal.tsx) — a two-column dialog (the category's windows left, the selected window's WindowExceptionEditor right), collapsing what used to be a per-window stack of forms into one window-at-a-time editor. The engine applies them in [expandCategoryWindowPeriods](utils/calendar-generation/helpers/TimeSlotManager/expandCategoryWindowPeriods.ts) — the ONE expansion shared by the slot fabric, CategoryEvent materialization, and wrapper recovery, so they can never disagree on which occurrences exist. A day/startTime re-anchor (modal drag, start-edge resize, assistant window edit) clears the window's exceptions, template-style; endTime-only resizes preserve them (moved occurrences derive duration from the window).
  - **CategoryEvent** — engine-materialized weekly occurrence with a composite id `` `${categoryTimeWindowId}|${YYYY-MM-DD-local}` ``. The date component is the ORIGINAL rule-derived occurrence date, so an occurrence moved by exception keeps its identity while `start`/`end` carry the override. Carries `trespassingStart` / `trespassingEnd` flags stamped by the engine when its placement violated a category boundary; the renderer reads these directly for red-border display.

  A category only constrains scheduling geometry when `useTimeWindows === true` **and** `timeSlots.length > 0`. Otherwise it still contributes location inheritance, but not slot shape or strictness.

  ### Strict vs. soft categories

  - `isStrict: true` — only items belonging to this category can be scheduled in its windows. Other items are filtered out, and the capacity check subtracts the window from any overlapping gap.
  - `isStrict: false` — other items may fill empty space inside the window.

  ### Window cascade (hierarchy)

  An item is a member of its own category **and every ancestor** by extension: a `project` (nested under `work`) item may schedule in a `work` window, but a plain `work` item never lands in a `project` window (descendant, not ancestor). Membership is what `isStrict` gates against, so a strict `work` window still admits `project` items.

  - `confineToOwnWindows: true` opts a category **out** of the upward cascade — its items schedule only in its own windows (dedicated collection time), and it becomes a ceiling for any descendant climbing the chain.
  - The eligible window-category set per category is memoized once per engine pass by [buildCategoryEligibilityMap](utils/calendar-generation/helpers/CalendarGenerator/buildCategoryEligibilityMap.ts) (own id + non-confined ancestors up to a `confineToOwnWindows` ceiling) and threaded through `SchedulingContext`. Match sites — `findAllFittingSlots`, `maxEffectiveCapacityFor`, `largestCompatibleSlotForLargestTask` — test set membership, not id equality. The UI toggle lives in the category editor and only shows for sub-categories (no ancestor to cascade into ⇒ no effect).

  ### Engine messages

  - **EngineMessage** — engine-materialized console row with a deterministic id (`${TYPE}::${discriminators}`) and a typed JSON payload. Same "wholesale-write + diff by id" pattern as CategoryEvent / TravelEvent; the id encodes what makes an instance unique (plannerId, reason, travel tuple, placed count) so a shifted placement surfaces as a new row and an unchanged one is a no-op diff.
  - **Dismissed flag** is user-owned. The engine consults the previous emit array at coalesce time and carries `dismissed: true` forward when the same id is re-emitted; a fresh id (situation shifted) surfaces as a new, undismissed row. The engine never flips it back, so recovery is UI-side: the calendar console's "Show dismissed" section and the Alerts tab's always-visible dismissed group restore via `undismissEngineMessage` (same diff sync as dismissal). `TASK_TOO_LARGE` carries an optional `limitingAxis` (which structural ceiling bound the leaf — an emit-time fact from `leafStructuralCapacity`); the renderer combines it with a current-tree walk to name the exact allowed times (inheritance attributed to the ancestor carrying them) and window categories in the console prose. Full identity model + payload shapes live in [utils/calendar-generation/models/EngineMessage.ts](utils/calendar-generation/models/EngineMessage.ts).
  - Presentation prose (titles, bodies, tags) is generated by [utils/renderEngineMessage.ts](utils/renderEngineMessage.ts) from the current entity tree — the engine emits structured facts only, so a category rename doesn't rot a persisted message.

  ---

  ## Calendar generation engine (summary)

  The engine takes `{ planners, templates, categories, previousCalendar, options }` and returns `{ events, categoryEvents, travelEvents }`. It is a stateful pipeline organized as an orchestrator + strategies + identity-tracked travel. Imported external-calendar events resolved to busy blocks (`SimpleEvent` shape, `eventType: external`) ride in via `options.externalBusyEvents`: they join the fixed-event fabric so slots are carved around them, then are filtered back out of the persisted output (`assembleFinalEventList`). See "External calendars" in the domain model.

  - Public entry: [utils/calendar-generation/calendarGeneration.ts](utils/calendar-generation/calendarGeneration.ts). It filters `isTriaged === false` rows out at the input boundary — untriaged Capture-inbox / brain-dump jots (duration 0, no `starts`) would otherwise fail validation and blank the whole calendar (any validation error returns empty events). A start-less **plan** is a validation *warning*, not an error (`validatePlanners.ts` / `buildPlanEvents` null-guards it), so triaged-but-timeless plans don't blank it either.
  - Module exports: [utils/calendar-generation/index.ts](utils/calendar-generation/index.ts).
  - Core classes (in [utils/calendar-generation/core/](utils/calendar-generation/core/)): `CalendarGenerator` (12-phase orchestrator; final phase emits EngineMessages), `Scheduler` (5-phase per-task pipeline), `TimeSlotManager` (thin holder for the sorted slot array), `TravelManager` (travel lookups + leg tracker).
  - **Flat-order scheduling.** The scheduler is leaf-driven, NOT goal-at-a-time: candidate roots are flattened to a single leaf pool ([buildLeafGraph](utils/calendar-generation/helpers/Scheduler/buildLeafGraph.ts)) and placed one leaf at a time by [scheduleTasksAndGoals](utils/calendar-generation/helpers/Scheduler/scheduleTasksAndGoals.ts) via the shared [placeLeaf](utils/calendar-generation/helpers/Scheduler/placeLeaf.ts) primitive (which reuses `scheduler.scheduleTask` + day-cap/split ledgers untouched). Ordering key: category-constrained leaves first (they compete for scarcer slots — the tier `sortByPriorityAndConstraints` gave the old candidate walk), then inheritance-adjusted score (`computeEffectiveScores` / leaf-level `leafEffScore` — a prerequisite inherits its dependents' urgency, backward-only), then a clustering index (a goal's leaves stay grouped). Goal-internal chaining is a per-leaf chain edge; the queue/dependency cross gate stays root-level ([precedenceGate.ts](utils/calendar-generation/helpers/Scheduler/precedenceGate.ts)); detours are chain edges from the spliced sequence. Chain ends accumulate across passes (a split leaf's early chunks bound its successors); a candidate with no schedulable leaves resolves through its own cross gate carrying the bound forward (queue successors never jump a fully-handled middle member); budget-exhaustion `NO_SLOTS` failures coalesce per structural root. The slot fabric, static travel pass, incremental horizon expansion, and capacity gating are unchanged. See the deep-dive.
  - Each phase delegates to function modules under [utils/calendar-generation/helpers/<Name>/](utils/calendar-generation/helpers/).
  - Strategies in [utils/calendar-generation/strategies/](utils/calendar-generation/strategies/): `EarliestSlotStrategy`, `LocationGroupingStrategy`, combined by `CompositeStrategy`.
  - Tunable constants in [utils/calendar-generation/constants.ts](utils/calendar-generation/constants.ts): `SCHEDULING_CONFIG` (horizon chunk, watermark, placement buffer, iteration caps), `URGENCY_CONFIG`, `SchedulingFailureReason`.
  - The horizon is incrementally expanded (`HORIZON_CHUNK_DAYS = 28`); the slot array carries an `isFinal` pickup marker for the next chunk.

  Everything else — slot union, shard model, static travel pass, dynamic placement, buffer model, capacity gating, strategies, debug switchboard, edge cases — is in [documentation/calendar-generation-deep-dive.md](documentation/calendar-generation-deep-dive.md). Compress from there if writing about it elsewhere; do not re-document here.

  ---

  ## AI assistant (goal-forest + weekly-template + category-window + precedence planning)

  **BYOK access model.** The assistant runs on each user's OWN Anthropic API key. The key is validated client-side (a free `models.list` call), AES-GCM-encrypted under a non-extractable WebCrypto key, and stored per userId in an IndexedDB vault ([lib/aiKey.ts](lib/aiKey.ts)) — per device, never in Redux/localStorage/React state, and never in any request to our server. The server knows only the MODE: `User.aiMode` (`BYOK | MANAGED | OFF`, null = undecided, gates like OFF; `MANAGED` is reserved for a future app-key paid tier — the engine's `baseURL` parameter is the transport seam for its thin auth+quota proxy). The protected layout reads `aiMode` alongside `onboardedAt` and threads it into `AiAccessProvider` ([components/ui/shell/AiAccessContext.tsx](components/ui/shell/AiAccessContext.tsx)), which combines it with device-key presence into `status: ready | needs-key | off | loading` plus `saveKey/removeKey/setMode/getApiKey`. When status isn't `ready`, `AIDraftModal` renders [AssistantGate](components/draft/AssistantGate/AssistantGate.tsx) (key entry + explanation, opt-out variant for onboarding) in place of the chat — so every entry point gates through one panel with zero per-entry-point code. Users opt in/out on the onboarding AI step (skip records `OFF`) and manage the key under Settings → AI assistant (mode picker, masked hint, replace, remove).

  One global assistant, always reachable: **mod+I**, the Sparkles button in the Sidebar, or the "AI assistant" button in `ItemTabs`. It operates on the whole **forest** of triaged top-level rows — restructuring existing goals, creating new goals with full subtrees, deleting goals, and setting flexible **repeat rules** on task/goal roots — on the user's **weekly templates** (EventTemplate rows: sleep, work hours, standing commitments), on the full **categories domain**: the category records themselves (create/rename/recolor/reparent/relocate/delete, plus the `useTimeWindows`/`isStrict`/`confineToOwnWindows` flags) and their **time windows** (CategoryTimeWindow rows), on the **precedence domain**: queues (create/rename/recategorize/delete, member add/move/remove) and dependencies (add/remove prerequisite edges), and on the **habits domain**: buckets (the habits surface's own grouping — create/rename/recolor/delete) plus trackers (create/rename/recolor/rebucket/delete) and their tracked-item sets (repeating top-level items only) — so "set up my week, this goal, and a meditation habit" happens in one conversation. Untriaged Capture-inbox jots are excluded and never touched. Locations are read context only (they can't be created here — they need Google Places), though categories and items may be assigned to existing ones.

  Mounting: `AssistantProvider` ([components/ui/shell/AssistantContext.tsx](components/ui/shell/AssistantContext.tsx)) wraps `AppShell` in the protected layout; [GlobalAssistant.tsx](components/draft/GlobalAssistant/GlobalAssistant.tsx) is passed into AppShell's `assistantSlot`, which mounts as a CANVAS child (not inside mainColumn), so the modal (`position: absolute; inset: 0` at `zIndex.floating`) fills the whole shell canvas — sidebar and mobile tabs covered (routes can't change underneath), clipped to the shell's rounded frame inside the bezel, with the Capture/Search palettes and confirm dialogs still layering above. The WeekStructureModal reaches the same canvas via `Dialog.Portal container={useShellPortalTarget()}` ([components/ui/shell/ShellPortalContext.tsx](components/ui/shell/ShellPortalContext.tsx) — AppShell provides the canvas element; use it for any full-canvas overlay). `Dialog modal={false}` is kept so those palettes stay interactive; outside-interaction dismissal prevented; Esc / Close only. Focus resolution: an explicit `AssistantScope.focusItemId` from the opener wins, else the `/items/[id]` route is detected; either maps to its root via `getRootParentId` and is sent as a prompt hint plus default tree-pane expansion.

**Embedded mode (onboarding AI step).** `AIDraftModal` takes `embedded`/`intent`/`onSaved`/`onStateChange`/`resumeConversationId`/`onConversationIdChange` props. `intent="onboarding"` (the value `AssistantScope.intent` reserves) both threads to the engine for a prompt preamble (`intentBlock` — triage the raw brain-dump jots, which arrive as untyped tasks: shape each into a task or a goal with subtasks, set durations/deadlines, assign each to one of the user's *roles*, ready eligible goals) and tunes the instance: empty-state hint, no History popover, no most-recent `autoResume`, and an **auto-sent kickoff message** (fires once per mount after hydration AND after the resume attempt settles — `resumeSettled` from `useAIDraftState` — with items-present vs empty-forest phrasing). Instead of most-recent resume, the instance resumes **its own conversation**: the id is reported via `onConversationIdChange`, persisted in onboarding's `StoredProgress.aiConversationId`, and passed back as `resumeConversationId` so a page refresh mid-interview reopens the same chat (a missing/deleted id degrades to a fresh kickoff; unsaved tree proposals still reseed from canonical — only the chat persists). `embedded` renders inline via `embeddedRoot` (no Dialog overlay, no save/cancel banner); the host (`OnboardingAIStep`) owns the Save action, driving it through the reported `{hasChanges, isStreaming, save}` (`onStateChange`) and getting `onSaved` (not `onClose`) on save. Back out of the step confirms first when `hasChanges`; a confirmed discard also clears the stored conversation id, so returning starts a fresh interview.

  Split-pane modal ([components/draft/](components/draft/); domain logic in [utils/draft/](utils/draft/)):

  - **Left**: chat pane. User bubbles right, assistant responses left-aligned as plain text; `initialDraft` prefills the composer without sending. The chat pane sits on `color-mix(ink 4%, paper)` so it reads as sunken relative to the tree pane. While a response streams the send button becomes a **Stop** button (aborts the in-browser engine run; the engine forwards the AbortSignal to the Anthropic stream; the interrupted bubble is finalized — "Stopped." if it had no prose yet). On abort, completed work stays but truncated tails roll back: the stamped `propose_goals` re-emit carries `complete: true` (fromOps trees count as complete), and the client refolds the turn from only the completed callIndexes, dropping any proposal whose finalized emit hadn't arrived. **Conversations persist to the DB** — a `DraftConversation` row (client-minted uuid id, title from the first user message, whole message array as Json) upserted by a debounced effect in `useAIDraftState` whenever the chat settles, guarded by a last-persisted snapshot so loading a conversation never bumps its own `updatedAt`. Server surface: [actions/draftConversations.ts](actions/draftConversations.ts) (list/get/upsert/delete, capped at 50 conversations, NOT part of the diff sync). The header has a **History** popover (list + load + delete, via `ChatHistoryPopover`) and a **New chat** reset; on the first open of a fresh page load the most recent conversation auto-resumes. Only the trailing 40-message window rides into each engine turn (prompt hygiene); working drafts still reseed from canonical on each open.
  - **Right**: a tabbed review pane — **Goals / Week / Categories / Queues** tab buttons in the pane header (internal tab keys `goals`/`week`/`windows`/`queues`), each with a change-count badge; during a stream the pane auto-follows the domain the assistant is editing unless the user clicked a tab this turn (pin resets per send).
    - **Goals tab**: `JsonForestView` — one collapsible section per top-level goal (chevron + title + `CategoryBadge` + goal-level diff badge), the focused goal and changed goals expanded by default, with the per-node diff overlay from [diffDraftTree.ts](utils/draft/diffDraftTree.ts); deleted nodes/goals stay visible in place. **Display is relevance-scoped**: the pane shows only the focused goal, goals the AI touched, and goals brought into view via the `show_goals` tool (display-only tool → the `onShow` callback), plus a "Show all" header toggle. Show-all mode groups goals under category headers (provider order, uncategorized last); the relevance-scoped view stays flat. The full forest is still sent to the model and held in working state — visibility is a render filter only, so Save/delete semantics are unaffected.
    - **Week tab**: `TemplateWeekView` — Monday-first day-grouped template list with the same diff language (status badges + friendly changedFields), color dot, HH:MM–HH:MM range with a `+1d` overnight marker, location name ("Anywhere" when null). Always shows all templates — no relevance filter.
    - **Categories tab**: `WindowsView` — grouped by the diffed category records (working order, canonical-deleted appended): `CategoryDot` + name (struck through when deleted) + "under X" note on creates/moves + flag chips (`windows on/off`, `strict`, `own windows only`; accent-outlined when changed) + friendly changed-field text (renamed/color/moved/location) + status badge, windows beneath rows Monday-first with day + HH:MM–HH:MM and the shared status-badge diff language. Categories with no windows and no changes of their own are omitted. The change badge counts window rows plus changed category records.
    - **Queues tab**: `PrecedenceView` — one group per diffed queue (title struck through when deleted, category chip accent-outlined when changed, changed-field text + status badge) with numbered member rows (titles resolved from the working + canonical forests so drafts and deleted goals both render; per-member added/deleted badges), then a Dependencies group of "A → before → B" rows with the same badge language. The change badge counts changed queues plus changed dependency edges.
    - **Habits tab**: `HabitsView` — habits grouped under their BUCKET headings (mirroring the /habits page; bucket rows carry their own renamed/color changed-field text + status badge, struck through when deleted; unchanged empty buckets omitted, unsorted habits trail), each habit a group (name struck through when deleted, friendly changed-field text incl. "bucket" + status badge) with "tracks <item>" rows (titles resolved like the Queues tab; per-item added/removed badges). The change badge counts changed buckets plus changed habits.
  - **Draggable divider** between the panes (state clamped 20/80%; both panes have `minWidth: 240px`). On mobile the two panes collapse to one, with a chat/review `SegmentedControl` toggling between them (resets to chat on open).

  Data flow per turn:

  ```
  plannerForestToJson(planner)             → canonical DraftForest (triaged roots + subtrees; root categoryId stamped)
  useAIDraftState({open, canonical, canonicalTemplates, canonicalWindows,
                   canonicalPrecedence, canonicalHabits})
    ─ owns workingForest/workingTemplates/workingWindows/workingPrecedence/
      workingHabits + chat messages + conversation lifecycle (id minting,
      debounced DB upsert, auto-resume)
    User sends message
        │
        ▼
  runAssistantTurn (utils/draft/assistantEngine — IN THE BROWSER, dynamic
  import; the user's key is read from the device vault per send and calls
  api.anthropic.com directly with Sonnet 4.6; gate: sends are dropped unless
  AiAccess status is "ready")
    args: { currentForest, currentTemplates,
            currentPrecedence ({queues: [{id, title, categoryId,
            memberPlannerIds (ordered)}], dependencies: [{predecessorId,
            successorId}]} — member order is array position, exactly like the
            forest's sibling order; the engine prunes stale references against
            the forest at turn start),
            currentHabits ({buckets: [{id, name, color}], habits: [{id, name,
            color, bucketId, itemPlannerIds}]} — bucket + tracked-item sets,
            order non-semantic; item references pruned with the forest like
            precedence),
            recurringPlanIds (canonical recurring-plan roots — habit items
            must repeat, and plan recurrence is outside the forest contract,
            so plan eligibility checks against this static set),
            history (trailing 40), focus?,
            categories (full records: id+name+color+parentId+locationId+flags
            +timeSlots WITH window ids — built ENTIRELY from the WORKING
            categories state so pending drafts, including created categories,
            stay visible to the model on later turns),
            locations (id+name), today (local), apiKey, baseURL? }
    (the full forest stays on the device — Anthropic gets a compact per-goal
     INDEX line + the focused goal's tree; everything else is fetched on
     demand. Templates, category windows, queues/dependencies, and locations
     are small and ride in the prompt whole — no fetch dance for them)
    tools:
      read:  search_items({query}), get_goal_trees({goalIds})
      edit:  update_items, move_item, add_items, delete_items
             ← deterministic ops executed by draftForestOps.ts on the turn's
               working copy; the resulting trees are emitted as fromOps
               forest events (code-computed — never retyped by the model).
               Same-goal moves only; supplied ids on add are discarded
               and re-minted as draft ids; isReady / categoryId / splitting /
               maxMinutesPerDay / recurrence validation built in (splitting:
               leaves only, never plans; maxMinutesPerDay: top-level goals
               only; recurrence: top-level tasks/goals only, never plans —
               setting it clears the deadline, and the goal readiness gate
               accepts a repeat rule in place of a deadline).
      week:  add_templates, update_templates, delete_templates
             ← deterministic ops (draftTemplateOps.ts) on the turn's
               workingTemplates copy; each change emits a `templates`
               event carrying the FULL authoritative array (small flat list —
               last write wins, no callIndex folding, no fetch guard). Ids are
               engine-minted uuids that become the real DB ids at Save;
               locationId validated against the user's set; overlap is
               allowed (engine warns), never rejected.
      categories: add_time_windows, update_time_windows, delete_time_windows,
             add_categories, delete_categories,
             update_categories({id, name?, color?, parentId?, locationId?,
                                useTimeWindows?, isStrict?, confineToOwnWindows?})
             ← deterministic ops (draftWindowOps.ts) on the turn's
               workingWindows state {windows, categories}; each change emits a
               `windows` event carrying the FULL authoritative state
               (same contract as templates). Window AND category uuids are
               engine-minted and become the DB ids at Save. Windows may be
               within-day (startTime < endTime) or overnight (startTime >
               endTime, running into the next morning); "23:59" is the
               end-of-day sentinel. The engine, the WeekStructureModal grid,
               and the assistant validator all handle the wrap (equal bounds
               are rejected). add auto-enables
               useTimeWindows on the target category (reported in the tool
               result). Category ops validate parentId against the working
               set (drafts included; self/descendant reparent rejected),
               locationId against the user's locations, reject duplicate
               sibling names, and delete cascades the subtree + its windows.
      precedence: add_queues, update_queues, delete_queues,
             add_queue_members, move_queue_member, remove_queue_members,
             add_dependencies, remove_dependencies
             ← deterministic ops (draftPrecedenceOps.ts) on the turn's
               workingPrecedence state; each change emits a `precedence`
               event carrying the FULL authoritative state (same contract as
               templates/windows). Queue uuids are engine-minted and become
               the DB ids at Save. Endpoints must be top-level non-plan
               forest roots (draft ids included); one queue per item; every
               member insert/move and dependency add runs the SHARED cycle
               validators (findCycle/findCycleInGraph over the merged draft
               graph) and a refusal carries the closing path in the
               tool_result ("A" → "B" (through the X queue) → "A") so the
               model explains it in prose. Forest edits inside the turn
               prune the precedence state (deleted goal ⇒ member/edge drops,
               re-emitted through the same events).
      habits: add_habit_buckets, update_habit_buckets, delete_habit_buckets,
             add_habits, update_habits, delete_habits,
             add_habit_items, remove_habit_items
             ← deterministic ops (draftHabitOps.ts) on the turn's
               workingHabits state; each change emits a `habits` event
               carrying the FULL authoritative state (same contract as
               templates/windows). Bucket AND habit uuids are engine-minted
               and become the DB ids at Save; habit bucketId validates
               against the WORKING buckets (same-turn drafts included) and a
               bucket delete unsorts its habits; tracked items must be
               top-level forest rows that REPEAT (task/goal roots by their
               contract recurrence, plans via recurringPlanIds; draft ids
               included, remapped at Save — a non-repeating id is refused
               with a "give it a repeat rule first" reason); forest edits
               inside the turn prune tracked-item references.
      build: propose_goals({goals, deletedGoalIds})   ← new goals + wholesale restructures
      show:  show_goals({goalIds | all})
        │
        │ tool-use LOOP (≤ MAX_TOOL_TURNS): stream → execute tool calls →
        │ append tool_results → stream again, until end_turn
        ▼
    partial-json parse of each propose_goals input_json_delta, dispatched as
    `text`, `forest` (with callIndex; the finalized stamped re-emit carries
    `complete: true`), `templates`, `windows`, `precedence`, `habits`, `show`,
    `status` callbacks (same payload shapes the old SSE events carried).
    GUARD: a proposal touching an existing goal whose tree the model has NOT
    fetched this turn (focused goal counts as fetched) is filtered out and
    rejected via tool_result — complete-tree replacement without the current
    subtree would silently delete children.
        │
        ▼
  onForest({callIndex, proposal}) → normalizeDraftForest
    → foldDraftProposals(turnStartSnapshot, proposals in callIndex order)
    → setWorkingForest
    (snapshot per send: each call's partial re-parses replace, never compound;
     multiple propose_goals calls in one turn stack via the fold)
        │
        ▼
  User clicks Save (hasChanges = forest dirty (draftForestsEqual, top-level
  order-insensitive) OR templates dirty (draftTemplatesEqual) OR windows/flags
  dirty (draftWindowsStateEqual) OR precedence dirty
  (draftPrecedenceStateEqual — queue-list order-insensitive, member order
  SENSITIVE; dependencies compare as a set of pairs) OR habits dirty
  (draftHabitsStateEqual — bucket and habit list order-insensitive, tracked
  items compare as sets))
        │
        ▼
  forest dirty → applyDraftForestToPlanner({planner, workingForest, userId,
                                            validCategoryIds, categoryColorById,
                                            dependencies, nodeIdMap})
    1. deleted roots: pure subtree filter (order is a local property; no
      neighbor fixup)
    2. retained goals (only if !draftTreesEqual): existing per-tree apply —
      UUID preservation, sibling sortOrder stamped from array position;
      root categoryId applied when it validates
    3. new roots: parentId null, sortOrder 0, isTriaged true, validated
      categoryId, children stamped per level; each minted root id is
      reported into nodeIdMap (draft id → permanent id, all levels) for the precedence
      apply
  templates dirty → applyDraftTemplates({current, canonical, working, userId, now})
    deletes removed rows, restamps updatedAt on changed rows, creates new rows
    keeping the route-minted uuid; UNTOUCHED rows return by object identity
    (the template diff compares timestamps, so identity = sync no-op); rows
    created elsewhere while the modal was open are preserved
  categories dirty → applyDraftWindows({currentCategories, canonical, working, userId, now})
    full category CRUD against the live array: assistant deletes cascade over
    the CURRENT tree (matching the DB's parentId cascade; concurrent children
    go too), per-field record deltas (name/color/parentId/locationId/flags)
    apply only where the assistant actually changed them (concurrent edits
    elsewhere win on untouched fields) and restamp updatedAt, new rows keep
    the route-minted uuid with sortOrder appended after their siblings, and a
    category deleted concurrently elsewhere is never resurrected. Each
    surviving category's timeSlots are rebuilt from the working windows
    (reparenting honored, userId stamped); window-only changes do NOT touch
    the category row (the category diff strips timeSlots but compares
    updatedAt); untouched categories return by object identity; concurrent
    rows made elsewhere are preserved. Runs BEFORE applyDraftForestToPlanner
    in handleSave so goal categoryIds validate against the SAVED category set
    (a goal filed under a category created this conversation keeps it)
  precedence dirty → applyDraftPrecedence({currentQueues, currentDependencies,
    canonical, working, nodeIdMap, nextPlanner, validCategoryIds, userId, now})
    runs AFTER the forest apply (it needs nodeIdMap + the saved planner for
    endpoint validity). Replays the assistant's deltas onto the LIVE arrays:
    queue deletes (concurrent member additions die with the queue, DB-cascade
    parity), per-field queue deltas (title/categoryId only where the
    assistant changed them), membership targets with no-resurrection (a
    member removed concurrently stays removed), concurrent additions
    preserved, and the user's concurrent placement winning a
    one-queue-per-item conflict; new queues keep the route-minted uuid,
    member rows reuse existing row objects when (i+1)*STEP keys match (an
    append leaves retained rows by identity), dependency rows are minted
    create-only/deleted by pair, and a final cycle defense re-validates the
    MERGED result — assistant-added members/edges that a concurrent edit
    turned cyclic are dropped, never user rows. handleSave then re-runs
    clampReadinessAgainstDependencies (exported from
    applyDraftForestToPlanner) against the final edge set, because
    assistant-created dependencies only exist with permanent ids after this
    apply.
  habits dirty → buildHabitChangeSet({canonical, working, currentBuckets,
    currentHabits, currentItems, nextPlanner, nodeIdMap})
    runs AFTER the forest apply (draft item ids remap through nodeIdMap; an
    unmapped draft reference is dropped, and items must resolve to top-level
    REPEATING rows in the SAVED planner — a row that stopped repeating drops
    out). Produces a DELTA (bucketDeletes/bucketCreates/bucketUpdates plus
    deletes/creates/updates/addItems/removeItems, concurrent-safe: no
    resurrection for buckets or habits, per-field updates, adds skip existing
    links, habit bucketId validates against surviving + created buckets)
    replayed by the out-of-band server action applyHabitChanges —
    fire-and-forget after updateAll, mirrored back wholesale via
    hydrateHabits (habits never ride the OCC sync).
        │
        ▼
  updateAll(nextPlanner, undefined, nextTemplates, nextCategories, nextQueues,
  nextDependencies) → ONE engine regen → one sync (clean domains pass
  undefined so their state keeps identity; the thunk dispatches setCategories
  before regenerating when categories are passed, and central precedence
  pruning runs there on every pass — CalendarPayload carries categories,
  queues, and dependencies fields for this)
  ```

  Contracts worth not breaking:

  - **Working drafts seed only after hydration** — `useAIDraftState` adopts canonical as the working copy on `open && ready` (`ready` = CalendarProvider's `isLoaded`), and the dirty flags return false until then. A modal open before the initial snapshot lands (onboarding resumed on the AI step, mod+I right after load) would otherwise seed an EMPTY working forest: every real item diffs as deleted, the model is sent an empty forest, and Save would actually delete everything. Send and save are guarded on `isLoaded` too.
  - **UUID preservation is load-bearing** — see the `preserve-planner-ids` memory note. The AI is instructed to echo existing ids; the reverse parser only trusts an id inside the subtree of the goal being applied (any other id becomes a fresh UUID). Queue members and dependency edges reference these ids, so a silently re-minted root id would orphan its precedence links.
  - **`sortOrder` is never emitted by the AI** — sibling order is array position (top-level goal order is NOT semantic; goals match by id). The reverse parser stamps fresh fractional keys from array position at each level.
  - **Goal-granular deltas** — the model never re-emits untouched goals; unchanged goals are skipped at apply time so they see zero `updatedAt` churn and no phantom sync diffs.
  - **Fetch-before-modify is enforced by the engine** — tool results are not carried between user messages (chat history is prose-only), so the model must re-fetch trees each message; the engine rejects proposal entries for unfetched existing goals rather than trusting the prompt alone. The deterministic edit tools are exempt: they operate by id on the turn's working copy, so they cannot drop data the model never saw.
  - **Draft ids are engine-minted** — id-less nodes in an accepted `propose_goals` call (and every `add_items` node) get UUIDs stamped by the engine (`assignDraftIds` / `mintDraftIds`); the stamped trees are merged into the turn's working copy, re-emitted under the same `callIndex` (replacing the id-less partials), and the new root ids are reported in the tool result. Unsaved drafts are therefore first-class for every tool — fetchable, editable, replaceable by id, deletable — instead of duplicate-prone rebuilds from model memory. Draft ids never reach the DB: they match no canonical root at Save, so `applyDraftForestToPlanner` mints the permanent UUIDs.
  - **Edit ops never touch sortOrder** — draftForestOps works on the nested tree where order is array position; fractional keys are stamped once at Save by applyDraftForestToPlanner.
  - **`categoryId` rides on top-level goal roots only**; children inherit. This is a row-level invariant, not just a draft-contract one: descendants are stored with `categoryId: null` and resolved by parent-chain walk (engine: `buildPlannerCategoryMap`; UI: `getEffectiveCategoryId`) — an explicit child value would win over the walk and pin leaves to a stale category's windows after a root-level switch. `applyDraftForestToPlanner` stamps null on new descendants AND clears retained ones (healing pre-invariant rows); item detail's category change cascades the clear (`assignCategoryToSubtrees` in [utils/plannerBulkActions.ts](utils/plannerBulkActions.ts)) and only renders the category picker on root items. Null on a retained root means "leave as is" (backfilled in `mergeDraftForest`); an id not in the user's category set is ignored. New top-level rows are never plans (`starts` isn't in the contract; coerced defensively).
  - **`color` rides on top-level goal roots only** (same rule as `categoryId`): optional hex on the root, children inherit it on save, null on a retained root means "leave as is". A new goal's color resolves AI pick -> its category color -> a deterministic palette pick keyed on the id (`resolveNewRootColor` / `fallbackCalendarColor`), never the silent `calendarColors[0]` red default that `buildTaskEvent` falls back to for a null `Planner.color`. The library "New item" modal and every AI-created row therefore get a real color; only Capture-inbox jots stay uncolored.
  - **The loop runs in the browser, not on a server** — `runAssistantTurn` ([utils/draft/assistantEngine/](utils/draft/assistantEngine/)) is a client-safe module (no `@/auth`, no `next/*`), dynamically imported at first send so the Anthropic SDK stays out of the shell bundle. The Anthropic client is built by `createBrowserAnthropicClient` (`dangerouslyAllowBrowser` + the `anthropic-dangerous-direct-browser-access` header); its `baseURL` parameter is the managed-mode seam. There is no app CSP today — if one is ever added, `connect-src` must include `https://api.anthropic.com`.
  - **Template draft ids ARE the DB ids** — unlike goal draft ids (re-minted at Save), an engine-minted template uuid survives into the EventTemplate row (WeekStructureModal set the uuidv4-id precedent). applyDraftTemplates must keep returning untouched rows by object identity: the template sync diff does not strip timestamps, so a fresh object with a fresh updatedAt would produce a phantom update on every save.
  - **Template ops never reject overlap** — overlapping templates are an engine warning by design; the assistant flags them in prose instead.
  - **Window AND category draft ids ARE the DB ids** — like templates: engine-minted uuids survive into CategoryTimeWindow and Category rows (WeekStructureModal mints client-side uuids at save, same precedent). Windows carry no timestamps, so the sync diff is purely value-based — but applyDraftWindows must stamp `userId` on rebuilt rows (the diff compares it) and must NOT restamp a category's `updatedAt` for window-only changes (the category diff strips timeSlots but compares updatedAt — a spurious restamp is a phantom category update).
  - **Windows may be overnight everywhere** (`startTime < endTime` within-day, `startTime > endTime` overnight running into the next morning, `"23:59"` end-of-day sentinel, equal bounds rejected). The engine (`expandSlotForDay`/`expandCategoryWindowPeriods` add 24h when `endMin <= startMin`), the WeekStructureModal (serializer renders the end on the next day; drag/resize/overlap handle the wrap via a weekly-minute ring in `windowRangeOverlaps`), and the assistant (`isValidWindowRange` allows `startTime !== endTime`; `findWindowOverlaps` uses the same ring so an overnight window is checked across the day boundary and the Sat/Sun seam) all agree. The one deliberate seam: `hhmmToMinutes("23:59")` is 1439 in the engine but the overlap checkers treat the `"23:59"` sentinel as midnight (1440) — a 1-minute discrepancy that only matters for a window literally touching midnight.
  - **Window overlap is checker-enforced via the model, not op-rejected** — unlike templates (overlap allowed by design), windows must never overlap. `findWindowOverlaps` (draftWindows.ts) runs after add/update window ops; collisions involving the touched windows are appended to the tool_result (`"Work" Sat 10:00-14:00 overlaps "Fun" Sat 12:00-16:00`) and the prompt instructs the model to resolve them before ending its turn. Ops still accept the state so a batch can be fixed by a follow-up call; pre-existing overlaps in user data are not re-reported on unrelated ops.
  - **The assistant has full category CRUD, prompt-gated where it reshapes things** — `add_categories`/`update_categories`/`delete_categories` cover name, color, parentId, locationId, and all three scheduling flags. The prompt reserves `isStrict`/`confineToOwnWindows` changes and any delete for explicit user requests (deletes cascade the subtree + windows; items become uncategorized via the DB's `SetNull`, never deleted). `add_time_windows` still auto-enables `useTimeWindows` deterministically. Locations remain read-only (creation needs Google Places) — only assignable by id.
  - **Category apply is per-field, concurrent-safe** — applyDraftWindows applies only the fields the assistant actually changed (canonical vs working), so edits made elsewhere while the modal was open survive on untouched fields; a concurrent delete elsewhere wins over an assistant edit (no resurrection), and an assistant delete cascades over the current tree exactly like the DB's `parentId` cascade will.
  - **Categories apply before the forest at Save** — handleSave computes `nextCategories` first and validates goal `categoryId`s against it, so filing a goal under a category created in the same conversation survives the save.
  - **Queue draft ids ARE the DB ids; planner draft ids inside precedence are NOT** — an engine-minted queue uuid survives into the Queue row (templates/windows precedent), but a queue member or dependency endpoint naming a draft PLANNER id must be remapped at Save: the forest apply mints permanent ids and reports them through `nodeIdMap` (all levels — new roots AND children re-minted on delete+recreate paths, so node-level dependency endpoints survive restructures), and `applyDraftPrecedence` translates. An unmapped draft id (a draft that was never saved) is dropped, never persisted. This is why the precedence apply runs AFTER the forest apply — reordering them silently drops every queue/dependency reference to same-conversation goals.
  - **Member order is array position in the draft contract** — `memberPlannerIds` order IS schedule order; fractional QueueMember `sortOrder` keys are a save-time concern (`applyDraftPrecedence` reuses row objects when the `(i+1)*STEP` keys already match, so a pure append leaves retained members by identity). Dependencies are identified by their endpoint pair, not row id — rows are immutable create/delete, matching the sync diff.
  - **Precedence ops run the SHARED cycle validators** — `draftPrecedenceOps` builds the merged legality graph (`draftPrecedenceEdges`: full queue chains + dependency edges, the collectValidationEdges mirror) and refuses member inserts/moves and dependency adds through `findCycle`/`findCycleInGraph`, returning the closing path in the failure reason. The save-time apply re-validates against the MERGED live state (concurrent edits included) and drops assistant-added artifacts — never user rows — if a loop slipped between op time and save.
  - **Precedence prunes with the forest, at every layer** — the engine prunes the working precedence state at turn start and after every forest mutation (delete_items / propose_goals deletions), `applyDraftPrecedence` filters endpoints against the saved planner, and the thunk's central pruning is the final backstop. A deleted goal must never linger as a member/edge in any copy.
  - **Recurrence rides the contract on top-level task/goal roots only, splitting-style** — `DraftNode.recurrence` `{freq, interval, until}` is emitted by `plannerTreeToJson` (null for plans and children), validated by `update_items` (roots only, never plans; setting it clears the deadline — the two are mutually exclusive), and applied with null semantics (a retained root re-emitted without it stops repeating, dropping its per-period skip exceptions; an unchanged rule keeps them). Retained PLAN recurrence stays outside the contract (spread-preserved), stale nested values are healed to null, and the goal readiness gate accepts a repeat rule in place of a deadline at every layer (ops, apply, item detail).
  - **Habit AND bucket draft ids ARE the DB ids; tracked-item references remap like precedence** — engine-minted habit and bucket uuids survive into the Habit/HabitBucket rows (queue/template precedent), but `itemPlannerIds` naming draft planner ids remap through `nodeIdMap` at Save (unmapped drafts drop, as does anything that doesn't resolve to a REPEATING top-level row in the saved planner). Buckets are the habits surface's own grouping — bucket ids and category ids are never interchangeable, and the op layer validates habit `bucketId` against the WORKING bucket set so a habit can be filed into a bucket created the same turn. Habits are the one assistant domain applied OUT-OF-BAND: `buildHabitChangeSet` produces a concurrent-safe delta (bucket + habit deletes/creates/per-field updates, no resurrection, set-diff item changes) that `applyHabitChanges` replays server-side after `updateAll`, mirrored back wholesale into the habits slice — never through the OCC sync. The working habit state prunes with the forest exactly like precedence.
  - **The key never crosses our trust boundary** — the user's Anthropic key lives only in the device vault ([lib/aiKey.ts](lib/aiKey.ts): AES-GCM under a non-extractable CryptoKey in IndexedDB, per userId) and in direct browser → api.anthropic.com requests. Never put it in Redux, localStorage, React state, logs, or any request to our own server; the engine receives it as a call argument read freshly from the vault per send. `AiAccessProvider` is the ONE place access state is derived; gating UI is `AssistantGate`, rendered inside `AIDraftModal` so entry points need no per-site checks.

  Unit tests: [__tests__/draft/](__tests__/draft/) covers forest apply (UUID preservation, subtree deletion, sortOrder stamping, categoryId validation, splitting AND daily-limit round-trip/set/clear/heal), the forest edit ops (search, per-field update with plannerType/categoryId/readiness gating, same-goal move with cross-goal/cycle rejection, add with fresh-id minting, delete), draft-id stamping (assignDraftIds), merge, diff, and forest equality with hand-built planner arrays, plus the template domain: ops (minting, per-field validation, locationId gating), save-time apply (object-identity no-op rule, concurrent-row preservation), and diff/day-grouping — and the categories domain: ops (window + category minting, auto-enable, range validation, category field patches, reparent cycle rejection, sibling-name dedupe, cascade delete), save-time apply (category identity, flag-vs-window updatedAt rules, userId stamping, concurrent-edit preservation, create/delete/no-resurrection semantics), and diff/category-grouping — and the precedence domain: ops (queue minting, endpoint eligibility, one-queue rule, cycle refusals with paths across queues and dependencies, prune identity, state equality semantics), save-time apply (no-op identity, nodeIdMap remapping, unsaved-draft drops, member-row identity on append, no-resurrection, one-queue conflict resolution, per-field queue deltas, dependency dedupe/remap, concurrent-cycle defense), and the readiness clamp — and the recurrence contract ([recurrenceContract](__tests__/draft/recurrenceContract.test.ts): forest-json emission, round-trip/clear/heal, plan preservation, readiness-gate substitution, update_items validation) — and the habits domain ([draftHabits](__tests__/draft/draftHabits.test.ts): bucket minting/patch/delete-unsorts, same-turn bucket references, repeating-item eligibility for tasks/goals/plans, state equality/normalize/prune, and the change set's bucket deltas, item remap/drop rules, and no-resurrection semantics).

  ---

  ## First-run onboarding

  A once-per-user guided setup at [app/(protected)/onboarding/](app/(protected)/onboarding/). NOT a route — it's a **server-gated overlay**: [layout.tsx](app/(protected)/layout.tsx) (async server component) reads `onboardedAt`, and `ProtectedProviders` threads `needsOnboarding` into AppShell's `overlaySlot` → `OnboardingOverlay`, whose initial visibility comes from the server prop (no dashboard flash, no client round-trip). Finishing or skipping stamps `onboardedAt` via `completeOnboarding()` and hides in place. Reseed leaves admin `onboardedAt: null`. There is deliberately no dashboard setup-checklist fallback — skipping means skipping.

  Six steps (`TOTAL_STEPS = 6`): Welcome, **Roles**, Locations, Week, BrainDump, embedded-AI. It **commits as it advances** — each step writes real rows through the normal Redux → auto-sync path on Continue, and re-commits **reconcile** (never stack) so Back/forward is idempotent. Commits are **gated on `isLoaded`** (Continue disabled until the initial snapshot hydrates — an update dispatched earlier would be wholesale-replaced by the fetch), and data-driven prefills (existing roles/locations, the Work-location auto-pick) run as effects after hydration, never as mount-time initializers. The overlay swallows the shell's global palette shortcuts (mod+I/J/K) while visible:

  - **Roles** → `reconcileRoleCategories` (Covey `STARTER_ROLE_PRESETS`): creates top-level `Category` rows, restamps sortOrder/color on the roles this flow owns (reflecting the drag-reorder), removes deselected owned roles **childless-only**. Ownership is strictly creation-based — a matched pre-existing category is never adopted, restamped, or removed. Selections dedupe by normalized name (preset vs typed custom).
  - **Week** → sleep, exercise, and morning/evening routines = `EventTemplate` rows (`buildWeekTemplates`, unchanged blocks reuse the previously committed row via `reconcileWeekTemplateRows` so a re-commit is an empty diff; at commit, sleep + morning/evening routines default to a location named "Home" when one exists — the symmetric counterpart to the Work-location auto-pick — else Anywhere, and exercise is always Anywhere); work hours = time windows on a **Professional** role's Work sub-category (`applyWorkCategory`, `useTimeWindows`), matching the role preset so no stray "Career" is minted; disabling work after a commit clears those windows (`clearWorkCategoryWindows`, gated by the `weekWorkApplied` progress flag). Only sleep may cross midnight, and it is emitted as ONE overnight template block per day (`expandDailyRange` with `allowOvernight: true` keeps the crossing-midnight range as a single block whose duration runs past 24:00 — the engine and both calendar surfaces render that correctly, so sleep is no longer split at midnight); the within-day blocks pass `allowOvernight: false`, so an `end <= start` range is dropped rather than ballooned into an overnight block. (Work hours become time windows, which the WeekStructureModal grid can't render overnight, so `workCategory` still splits an overnight shift at midnight.)
  - **BrainDump** → pure capture, no type selector: every jot commits as a plain task (the AI step does the triage — task vs goal, deadlines, roles). `applyBrainDump` upserts triaged Planner rows by dump id, patching only fields the user changed vs the last-committed snapshot so AI-step edits (including retypes) survive a return trip. `DumpItem.type` remains in the stored model for blob compatibility; the UI always mints "task".
  - **Locations** → `createLocation` per row, persisting `createdId` markers incrementally so a partial failure doesn't duplicate on retry; a started-but-incomplete row blocks Continue with a message instead of being silently dropped.
  - **AI** → the embedded assistant (`intent="onboarding"`; see the AI-assistant section), behind the BYOK opt-in gate: until AiAccess status is `ready`, the step renders `AssistantGate` (key entry + "Skip AI for now") instead of mounting the modal — which also holds the auto-kickoff until the user decides. Opting out (gate button, footer Skip, or Finish while gated and undecided) records `aiMode = OFF`; entering a valid key records `BYOK` and the interview starts.

  Progress + owned-id sets persist per user to `localStorage["circadium.onboarding.progress.<userId>"]` (**StoredProgress v4**: `roleCommittedIds`, `weekTemplateIds`, the Week form snapshot `week` + `weekWorkApplied`, `dumpItems`, per-id `dumpCommitted` snapshots, `aiConversationId` for AI-step chat resume); `migrateProgress` normalizes older blobs and `loadProgress` adopts a legacy unscoped blob once. The theme preference (`theme.dark.<userId>`) is user-scoped the same way. Pure builders live in `_lib/` and are unit-tested ([__tests__/onboarding/](__tests__/onboarding/)); `_steps/` + `_components/` are UI.

  ---

  ## State & data flow

  ```
                            fetchCalendarData (initial)
                                    │
                                    ▼
    server actions ◄──── Redux (calendarSourceSlice, engineOutputSlice, schedulingSettingsSlice, userSlice)
                                    ▲
                                    │ dispatch
                                    │
    CalendarProvider ── useCalendarStateActions ─► updateAllCalendarStates
    (context)             updatePlannerArray /         (async thunk)
                          updateTemplateArray /              │
                          updateAll                          ▼
                                              runEngineCalculation(...)
                                              (Web Worker, latest-wins)
                                                            │
                                                            ▼
                                  events + categoryEvents + travelEvents + engineMessages
                                                written to engineOutputSlice
                                                            │
                                                            ▼
                                          useCalendarServerSync (300ms debounce)
                                              │
                                              ├─ OK   → bump dataVersion, refs forward
                                              ├─ stale → adoptFreshServerState
                                              └─ error → rollbackToLastConfirmedState
  ```

  (A fifth Redux slice, `externalCalendarSlice`, holds imported external calendars. It is written by direct actions and mirrored wholesale, so it never rides this OCC sync loop; CalendarProvider's once-per-load bootstrap hydrates + TTL-refreshes it, and it feeds the engine as busy blocks via `deriveExternalBusyEvents` at each regen. Same out-of-band pattern as `viewState`.)

  Key wiring:

  - **The engine runs in a Web Worker** ([utils/calendar-generation/engineWorkerClient.ts](utils/calendar-generation/engineWorkerClient.ts) + `engine.worker.ts`) so regens never block the main thread. Latest-wins: a new regen terminates any in-flight worker run mid-compute and the superseded caller resolves `null` (dropped silently). Falls back to a synchronous main-thread run when workers are unavailable or crash. In the thunk, source-state dispatches (`setPlannerAndTemplate`, `setCategories`) happen synchronously BEFORE the await so rapid consecutive functional updates chain off fresh state; only `applyEngineRun` waits for the worker. The thunk never gates source dispatches on `userId` (it hydrates a beat after page load; gating silently swallowed early edits) — a missing userId only skips the engine run.
  - **Calendar drag/resize run the engine inline** (`engineMode: "inline"` through `updatePlannerArray`/`updateAll` → thunk → `runEngineCalculation`): FullCalendar has already moved the tile internally, so an async regen would paint it overlapping stale placements for a frame. Inline commits source + engine output before the next paint. Everything else stays on the worker.
  - **Every FullCalendar option must be identity-stable across renders** — the React connector shallow-diffs its props, so a fresh inline arrow/object/array counts as a changed option and triggers an internal option reset; one landing mid-drag kills the interaction without firing `eventDrop` (the tile stays painted at the drop position, nothing dispatched, refresh reverts it). [Calendar.tsx](app/(protected)/calendar/_components/Calendar.tsx) is memoized with all callbacks in `useCallback` and static options hoisted to module scope; `dayHeaderContent` is a module-level function in [page.tsx](app/(protected)/calendar/page.tsx). Hover-label changes re-render the page continuously during drags (the drag mirror fires `onMouseEnter`), so this is load-bearing, not style.
  - **Event identity is stable across regens** ([stabilizeEvent](utils/calendar-generation/helpers/EventAssembler/stabilizeEvent.ts)): builders reuse the previous emit's `extendedProps.id`/`createdAt` and return the previous object when nothing changed, so an idle regen produces an empty diff. Do not reintroduce per-regen uuids/timestamps in event builders — every non-empty sync bumps the OCC `dataVersion`, and constant churn makes a second open window's syncs permanently stale (its edits get discarded by `adoptFreshServerState`). Plans are never memoized from `previousCalendar` for the same reason a `starts` drag must always re-derive them.
  - **Planner tree walks are memoized per array** — `getTreeBottomLayer` / `getSortedTreeBottomLayer` in [utils/goalPageHandlers.ts](utils/goalPageHandlers.ts) share a `WeakMap` index keyed on the planner-array reference (children sorted by `sortOrder` at build time + bottom-layer cache). Safe because planner updates are immutable everywhere; never mutate a planner array in place or the cache serves stale trees.
  - **CalendarProvider** ([context/CalendarProvider.tsx](context/CalendarProvider.tsx)) — owns the data context, fires regen on `bufferTimeMinutes` change, fires a one-time "cold-load autoregen" when categories/locations exist but no engine output materialized yet (see the inline comment for the conditions). It exposes `isLoaded` (true once the initial snapshot has hydrated Redux): consumers that commit against prev-state — onboarding is the archetype — must gate on it, because an update dispatched before hydration is wholesale-replaced when the fetch lands.
  - **Sync** uses **optimistic concurrency control** via `User.dataVersion`. The client sends the version it knows; if the DB has moved on, the transaction aborts and the client adopts a fresh snapshot wholesale. Partial application across a DAG-shaped dataset is unsafe.
  - **CategoryEvent**, **TravelEvent**, and **EngineMessage** are all written by the engine on every regen but use **deterministic IDs**, so the diff lands as creates/deletes only when an actual placement shifted (or, for EngineMessage, only when the underlying situation changed or the user flipped `dismissed`). Don't switch them to autogenerated IDs.
  - The 60-second transaction timeout in `syncCalendarData` exists because the first regen after a fresh load runs hundreds of writes on top of the usual diff.
  - **Sync-handler update paths use bulk raw SQL** ([actions/calendar-actions/sync-handlers/bulkUpdate.ts](actions/calendar-actions/sync-handlers/bulkUpdate.ts)) — a single `UPDATE ... FROM (VALUES ...)` per table via `$executeRawUnsafe`, regardless of row count. Prisma's `updateMany` only supports "same values for all matched rows", so per-row updates would otherwise turn into N sequential round-trips inside the interactive transaction (multiplied out by the OCC guard that forces interactive form). ExtendedProps uses `INSERT ... ON CONFLICT (eventId) DO UPDATE`. CategoryEvent and TravelEvent are already collapsed to `deleteMany + createMany` because the rows are engine-derived — don't rework those to bulk update. Ghost-id safety (no P2025 on missing rows) is preserved by the WHERE join in the bulk statement.

  ---

  ## App routes & access control

  - `routes.ts` defines `publicRoutes = ["/", "/privacy", "/auth/new-verification", "/auth/confirm-deletion"]` (`/privacy` is the public GDPR privacy-policy page, rendered outside the `(protected)` group), `authRoutes = [/auth/login|register|error|reset|new-password]`, and `DEFAULT_LOGIN_REDIRECT = "/dashboard"`.
  - `middleware.ts` uses the **edge-safe** `auth.config.ts` (OAuth providers only) — it must NOT import anything Node-only. The Credentials provider, bcrypt, and DB access live in `auth.ts`.
  - Everything under `app/(protected)/` requires login. Unauthenticated requests are redirected to `/`.

  Nav structure (from [components/ui/shell/nav.ts](components/ui/shell/nav.ts)):

  | Key | Route | Surface |
  | --- | --- | --- |
  | dashboard | `/dashboard` | Default landing after login |
  | calendar | `/calendar` | FullCalendar surface |
  | capture | `/capture` | Quick-entry surface |
  | library | `/library` | Task/goal browser |
  | habits | `/habits` | Habit trackers — user-owned buckets of habits over repeating items, week-aligned month grid, rate/streaks |
  | categories | `/categories` | Role + category management (nav label reads "Roles"; route path unchanged) |
  | queues | `/queues` | Queue (pipe) management — ordered work streams (desktop nav only) |
  | graph | `/graph` | Directional precedence graph — queue lanes + dependency connectors on a time axis (desktop nav only) |
  | mindmap | `/mindmap` | Mind-map canvas — roles → categories → items/leaves as a zoomable radial/horizontal tree (desktop nav only; distinct from the precedence graph) |
  | locations | `/locations` | Location + travel-time management |
  | feedback | `/feedback` | Support contact + suggestion wall (admins get a header link to `/admin/feedback`, the report inspector — deliberately not in the nav) |
  | settings | `/settings` | Profile / Account / Scheduling / AI assistant / Notifications (stub) / Integrations / Data & export / Danger zone (Mobile "More" tab) |

  ---

  ## Styling — Vanilla Extract

  **No Tailwind.** The leftover `components.json` is dormant — ignore it. Co-locate styles next to the component: `Foo/Foo.tsx` + `Foo/Foo.css.ts`. The Vanilla Extract plugin is wired in `next.config.mjs`.

  The design system has four layers. Prefer the higher-level surface (recipes, typography presets, sprinkles) over reaching for raw tokens.

  ### 1. Vars — theme-swappable ([lib/theme/tokens.css.ts](lib/theme/tokens.css.ts) + [themes.css.ts](lib/theme/themes.css.ts))

  CSS-custom-property contract with values assigned per theme (`themeLight`, `themeDark`). Groups:

  - `paper` / `bezel` / `ink` / `inkSoft` / `muted` / `rule` / `textOnAccent` / `overlay` / `tileFill` — flat surface + text colors
  - `surface.{canvas, sidebar, content, modal}` — shell chrome fills, painted directly on the canvas, Sidebar, and mainColumn (replacing the retired frosted-blur + gradient-blob backdrop). Theme-swappable (so they transition on light/dark toggle): **light** mode keeps the original warm off-white paper tones (`paperSurface` in [scales.ts](lib/theme/scales.ts) — hue 37, 20% saturation, three near-white lightnesses); **dark** mode uses the cool `grayscale` ramp (hue 225, 10% saturation, one stop every 5% of lightness, keyed by lightness %) at its dark end (10/15/20). Elevation reads brightest-on-top in both: canvas recessed, content raised. `modal` is the centered-modal tier — the `popover({size: "xl"})` fill, two rungs above content (dark: mostly-opaque `grayscale[30]` so it stays readable over the dimming overlay; light: the same frosted white as `glass.bgDeep`).
  - `glass.{bg, bgDeep, bgSoft, stroke, hi}` — frosted-panel surface fills (used as **base** fills, not hovers)
  - `interactive.{hoverFill, selectedFill}` — **row/button hover + selected states**. Direction inverts per theme: light-mode hovers **darken the paper** (ink at 7%/12%), dark-mode hovers **brighten** it (paper at 7%/12%). Use these for row hovers, not `glass.bgSoft`.
  - `shadow.{panel, panelSm}` — floating-surface elevation
  - `noise.{opacity, blend}` — noise overlay
  - `accent.{primary, now, done, secondary}` — brand accents
  - `status.{success, warning, error, info}` — semantic status
  - `swatches.{blue, green, violet, indigo, cyan, amber, rose, teal}` — category color palette
  - `font.{display, ui}` — font family bindings (Clash Display + Hubot Sans, wired in [fonts.ts](lib/theme/fonts.ts))

  ### 2. Scales — theme-independent numerics ([lib/theme/scales.ts](lib/theme/scales.ts))

  Single source of truth for sizing vocabulary. Both `sprinkles` and `style()` blocks import from here.

  - `space` (0–80px) — padding/margin/gap
  - `radii` — base tiers (`xs 6`, `sm 8`, `md 12`, `lg 16`, `xl 20`, `2xl 24`, `3xl 30`) + half-steps (`sm+2 10`, `md+2 14`, `lg+2 18`, `xl+2 22`) used by glass/popover recipes to sit intentionally rounder than a plain card at the same tier, plus `pill 999`. Values below 6 (2–5px) stay hardcoded as bespoke micro-corners.
  - `contentWidth` (`xs 520` … `2xl 1280`) — text measures + page containers. Prefer over raw `maxWidth: 1240`.
  - `breakpoints` (`mobile 767`, `tablet 1023`, `laptop 1279`) + `media` (prebuilt `@media` query strings: `mobile`, `tablet`, `laptop`, `tabletUp`, `desktopUp`, `wideUp`, `touch`, `landscapePhone`). Width is not the whole story: `mobile` (and by containment `tablet`/`laptop`) also matches a **landscape phone** — touch device whose height, the smaller dimension in landscape, is ≤599px (the Android 600dp phone/tablet divider) — and the `*Up` queries exclude it, so a phone keeps the phone UI when rotated even though it is ~800–930px wide. Orientation is the user's own: portrait phones get the standard portrait mobile layout, and physically rotating the phone lands in the landscape-phone layout — there is deliberately NO in-app rotation (no prompt, no forced frame, no toggle). `touch` keys on pointer capability alone and drives the interaction model on all touch devices (tablets included); `landscapePhone` corrects the rare mobile style whose portrait treatment assumes a tall viewport (the graph/mindmap 480px canvas block reverts to fill) — key it after the `mobile` block, later `@media` keys win within a style. `laptop` marks where a docked wide side panel (e.g. the calendar's 340px engine console) stops fitting and switches to an overlay. Rail+content page grids collapse to a stacked column at `tablet`, not `mobile` — the desktop sidebar persists through the tablet band. **Do not declare local `const MOBILE = "..."`** — import `media` from `@/lib/theme` and use `[media.mobile]` as the `@media` key.
  - `borderWidth` (`hairline 1`, `medium 2`, `thick 3`)
  - `zIndex` — semantic layers: `base 0`, `docked 5`, `raised 10`, `floating 30`, `palette 50`, `popoverOverPalette 60`, `modal 100`, `modalOver 150`, `toast 200`, `appLoading 300` (first-run data-load overlay, above every layer)

  ### 3. Recipes — component shapes ([lib/theme/recipes.css.ts](lib/theme/recipes.css.ts))

  `glass`, `popover`, `pillBtn`, `badge`, `formInput`, `progressTrack`. All reference the `radii` scale internally. `pillBtn.glass` / `pillBtn.glassInk` deliberately keep a **theme-neutral inset-white-wash** hover (not `interactive.hoverFill`) because those buttons can sit on either light or dark surfaces.

  ### 4. Typography — text presets ([lib/theme/typography.css.ts](lib/theme/typography.css.ts))

  `display.{hero, bigStat, pageTitle, statCard, modalTitle, sectionHead, panelTitle, listTitle}`, `text.{body, bodyLg, bodySm, row, label, microLabel}`, `caption`, `statusTag`. Prefer over inline `fontSize` when a preset fits — presets bundle family + weight + letter-spacing + feature settings.

  ### Sprinkles — atomic props API ([lib/theme/sprinkles.css.ts](lib/theme/sprinkles.css.ts))

  Consumes all scales. Notable atoms: `bg: "hoverFill" | "selectedFill" | "glassBg" | …`, `maxWidth: "xl" | …` (contentWidth), `borderRadius: "md" | …`, `zIndex: "modal" | …`. Media conditions `md` and `lg` correspond to `tabletUp` and `desktopUp`.

  ### Other conventions

  - Category color resolution lives in [lib/theme/categoryColor.ts](lib/theme/categoryColor.ts).
  - The 45° pinstripe pattern is reserved for marking category-affiliated items on the calendar — do not use it as a screen-level backdrop.
  - `colorMixAlpha` in [effects.ts](lib/theme/effects.ts) names the recurring `color-mix(in srgb, X N%, transparent)` percentages so consumers tune a hierarchy step, not a magic number.
  - The theme preference persists per user (`theme.dark.<userId>`, written by [ThemeProvider](components/ui/ThemeProvider.tsx)); the unscoped `theme.dark` serves logged-out pages and is the one-time fallback before a scoped value exists. Any new localStorage preference tied to account data should be user-scoped the same way (see onboarding progress and its legacy-adoption pattern).
  - **Drag-reorder language is shared**: full-width neutral rows, `interactive.hoverFill` on hover, dragged row at 0.4 opacity, 2px `accent.primary` inset lines for before/after drop zones (the onboarding Roles step speaks it). Don't invent a second visual grammar for reordering. The categories rail deliberately does NOT reorder — sibling order between categories has no scheduling meaning, so its grip drag is folder-like (subtasks-draggable visuals: left grip revealed on hover, floating title pill, `accent.now` tint on the nest target, rail highlight for "move to top level", drop flash).
  - Scroll containers whose content grows with user input should set `scrollbar-gutter: stable` so the scrollbar appearing doesn't reflow the layout (see the onboarding overlay + step body).

  ---

  ## Server actions pattern

  ```typescript
  "use server";
  import { auth } from "@/auth";
  import { db } from "@/lib/db";

  export async function myAction(data: MyType) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");
    // ... db work, scoped to session.user.id
  }
  ```

  Conventions:

  - Every server action verifies the session first and scopes queries by `userId`.
  - Direct mutations (Location create, travel-time refresh) that bypass the diff path must call `markSynced(kind, current)` on the sync hook afterward, or the next diff will treat them as missing-on-server.
  - Mutations that need to touch many tables go through `syncCalendarData` (transactional, OCC-gated). Single-row direct edits (categories, locations) live in their own action files.
  - **External-calendar** actions ([actions/externalCalendars.ts](actions/externalCalendars.ts), [actions/googleCalendar.ts](actions/googleCalendar.ts)) are a third direct-mutation variant: they mutate directly and mirror results into the `externalCalendar` Redux slice rather than calling `markSynced` — they live entirely outside the OCC diff sync (never bump `dataVersion`).

  ### Data export / import (GDPR)

  [actions/dataExport.ts](actions/dataExport.ts) (`exportUserData`) serializes the whole account to one JSON blob (`meta.format: "circadium.data-export.v1"`), deliberately excluding secrets (password hashes, OAuth/Google refresh tokens, auth tokens). [actions/dataImport.ts](actions/dataImport.ts) (`importUserData(payload, mode)`) is the counterpart, in one `$transaction`: **`replace`** wipes all of the account's own rows and restores the file with ids **preserved** (a true DB-migration restore, also restoring the single-row `UserSchedulingPreferences` + `UserViewState`); **`add`** brings the file's rows in as **new**, remapping every id (and every FK) so nothing collides, de-duping locations by `[userId, placeId]`. Engine-derived rows (calendar/category/travel events, engine messages) are never imported — the engine regenerates them. Both surface in **Settings → Data & export** ([DataSection](app/(protected)/settings/_components/DataSection/DataSection.tsx)); import bumps `dataVersion` and the client reloads (the write bypasses the diff sync).

  ---

  ## Database commands

  This project uses **migrations**, not `prisma db push`.

  ```bash
  # Local Postgres (Docker)
  pnpm db:start                       # docker compose up -d
  pnpm db:stop                        # docker compose down
  pnpm db:reset:dev                   # nuke volume, restart, migrate, seed

  # Migrations
  pnpm prisma:migrate:dev             # prisma migrate dev (interactive in dev)
  pnpm prisma:migrate:deploy          # prisma migrate deploy (CI / prod)

  # Other
  pnpm db:seed                        # prisma db seed
  pnpm db:studio                      # prisma studio
  pnpm prisma generate                # regenerate client after schema changes
  ```

  The seed creates a single admin user (`admin@lifeplan.com` / `password`) and populates locations, travel times, categories, templates, and planners. Seed planners are labeled with location markers `A/B/C/D` (no-location / Work / Home / Gym).

  Migration history (single source of truth in [prisma/migrations/](prisma/migrations/)):

  - `0_init`
  - `add_data_version` — the OCC counter on User
  - `add_category_event` — materialized weekly category occurrences
  - `add_travel_event` — materialized travel events
  - `add_planner_is_triaged` — Planner.isTriaged flag for the Capture triage queue
  - `add_engine_message` — engine-emitted console rows with deterministic id and JSON payload
  - `engine_message_user_index` — `@@index([userId])` for the fetch/sync-sweep queries
  - `add_engine_message_dismissed` — user-owned soft-dismiss flag; carried forward by the engine at emit time
  - `planner_user_cascade` — Planner.userId FK converted from RESTRICT to CASCADE so account deletion cascades cleanly
  - `add_account_deletion_token` — short-lived tokens for the email-confirmation step of account deletion
  - `user_id_indexes` — `@@index([userId])` across the per-user tables the fetch/sync queries filter on
  - `verification_token_user_id` — nullable `VerificationToken.userId` so email-change tokens resolve the user by id
  - `add_password_changed_at` — `users.password_changed_at`; the jwt callback invalidates tokens issued before it
  - `task_preferences_planner_cascade` — real FK `TaskPreferences.plannerId → Planner.id` with ON DELETE CASCADE (after an orphan cleanup); replaces the manual sweep that lived in `deleteAccount.ts`
  - `add_draft_conversation` — DraftConversation: AI-assistant chat history (client-minted id, messages as Json, `@@index([userId])`, cascade delete)
  - `add_planner_sort_order` — `Planner.sortOrder` (double precision, fractional sibling key) + SQL backfill deriving per-sibling-group order from the legacy dependency chain
  - `drop_planner_dependency` — retires the `dependency` linked-list column; sibling/leaf order lives in `sortOrder`
  - `add_category_confine_to_own_windows` — `Category.confineToOwnWindows` (default false); opts a subcategory out of the upward window cascade so its items stay pinned to its own windows
  - `add_user_onboarded_at` — nullable `User.onboardedAt`; the first-run onboarding gate ("needs onboarding" ⇔ `onboardedAt === null`). Backfills existing users to `NOW()` so only genuinely new accounts see it; the seed leaves admin `null`.
  - `add_week_start_day` — `UserSchedulingPreferences.weekStartDay` (0=Sunday .. 6=Saturday, default 1). Settings-owned preference; feeds FullCalendar `firstDay`, the engine's week bucketing, and every day-ordered UI list via `orderedWeekDays` in [utils/calendarUtils.ts](utils/calendarUtils.ts).
  - `add_plan_recurrence` — `Planner.recurrence` + `Planner.recurrenceExceptions` (nullable JSON strings). Recurring plans; the engine materializes occurrence events with composite ids and applies per-occurrence moved/deleted exceptions (see [utils/planRecurrence.ts](utils/planRecurrence.ts)).
  - `add_template_recurrence_exceptions` — `EventTemplate.recurrenceExceptions` (nullable JSON string). Per-occurrence moved/deleted overrides for weekly templates, keyed by the occurrence's original local start; applied by the engine in `masksToIntervals` and reflected on the calendar via `exdate` + one-off moved events.
  - `add_category_window_recurrence_exceptions` — `CategoryTimeWindow.recurrenceExceptions` (nullable JSON string). Per-occurrence moved/deleted overrides for category windows, applied in `expandCategoryWindowPeriods` (the shared expansion for slot fabric + CategoryEvent materialization); a moved occurrence keeps its original-date CategoryEvent id.
  - `add_task_splitting` — `Planner.splitting` + `Planner.completedSegments` (nullable JSON strings). Split tasks: chunking settings and the per-chunk completion record (completed minutes always derived by summing segments, never stored as a counter).
  - `backfill_task_is_ready` — SQL-only data backfill (no schema change). Readiness became the universal scheduling gate (tasks + goals, not goals alone); sets existing tasks and plans to `isReady = true` so their current scheduling behavior is preserved once the gate applies to tasks. Goals untouched (their readiness is user-controlled).
  - `clamp_priority_range` — SQL-only data backfill (no schema change). Priority moved from a 0-10 scale to a 1-7 scale (higher = more important, 4 neutral); clamps existing rows outside 1-7 into the range, leaving in-range values untouched. The range + default live in [utils/plannerPriority.ts](utils/plannerPriority.ts) (`clampPriority`, `PRIORITY_LEVELS`), consumed by both priority pickers, every create surface, and the AI draft ops.
  - `add_goal_day_cap` — `Planner.maxMinutesPerDay` (nullable Int). Goal daily cap: max minutes of a goal's subtree the engine may place on any single day (see "goal daily cap" in the domain model).
  - `add_planner_scheduling_constraints` — `Planner.earliestStartDate` + `Planner.allowedTimes` (nullable strings). Per-item placement bounds for tasks and goals, inherited down the tree (see "scheduling constraints" in the domain model).
  - `add_precedence` — `Queue` (title, int sortOrder, optional categoryId SetNull), `QueueMember` (fractional sortOrder, `@unique plannerId` = the one-queue-per-planner invariant, cascade both FKs), `PlannerDependency` (predecessorId/successorId cascade, `@@unique([predecessorId, successorId])`, immutable rows). See "precedence" in the domain model.
  - `add_planner_linked_item` — `Planner.linkedItemId` (nullable self-FK, `onDelete: SetNull`). Detour: a placeholder subtask redirects the scheduler into the linked target root's leaves (see "Detour" in the domain model).
  - `add_queue_color` — `Queue.color` (nullable String). Optional queue accent picked on the queues page; tints the queue's lane on the graph view, falling back to the queue's category color.
  - `add_user_ai_mode` — `User.aiMode` (nullable `AiMode` enum: `BYOK | MANAGED | OFF`). The server-known half of BYOK AI access: null = undecided (gates like OFF), set by the onboarding AI gate and Settings → AI assistant. The API key itself never reaches the DB — it lives encrypted in the device vault (lib/aiKey.ts). `MANAGED` is reserved for a future app-key paid mode.
  - `add_travel_time_negative_cache` — `TravelTime.unroutableAt` (nullable DateTime: negative cache for pairs Google can't route, so the missing-pairs diff stops re-buying stable failures; the engine matrix and Locations UI read it as no-route) + `UserSchedulingPreferences.lastTravelRefreshAt` (nullable DateTime: mode-independent cooldown stamp for `refreshAllTravelTimes`). Freshness policy (TTL, unroutable retry window, refresh gate) lives in [utils/locations/travelRefreshPolicy.ts](utils/locations/travelRefreshPolicy.ts).
  - `add_travel_top_up_stamp` — `UserSchedulingPreferences.lastTravelTopUpAt` (nullable DateTime). Persisted daily allowance for the silent background travel-time top-up (`topUpStaleTravelTimes`): the per-session element cap alone wouldn't bound spend, since sessions are free to create. Stamped only when elements are actually spent.
  - `add_travel_api_budget` — `TravelApiBudget`: account-global singleton row (id `"global"`, `elementsThisMonth`, `periodStart`) — the hard monthly stop on Routes API matrix elements (cap 4,500, headroom under the 5,000 Pro free tier; deliberately NOT per-user because Google's free caps pool across the billing account). Reserved transactionally before every matrix call in [actions/locations.ts](actions/locations.ts); resets on the calendar-month boundary, matching Google's cap reset.
  - `add_planner_notes_and_user_view_state` — `Planner.notes` (nullable String: free-form user notes, never read by the engine; edited in the item-detail Notes card and the subtask EditDrawer, rides the normal planner sync/diff) + `UserViewState` (one row per user, `graph`/`mindmap` nullable JSON strings: canvas view preferences saved by a debounced direct action in [actions/viewState.ts](actions/viewState.ts) — deliberately outside the OCC diff sync so view tweaks never bump `dataVersion`).
  - `add_external_calendar` — `ExternalCalendarSource` (kind `ICS | GOOGLE | MICROSOFT`, `mode BUSY | VISUAL` + per-source `modeExceptions` JSON, `url`/`name`/`color`/`enabled`/`lastFetchedAt`/`lastError`, `@@index([userId])`, cascade) + `ExternalEvent` (per-source imported occurrences: deterministic composite id `` `${sourceId}|${uid}|${occurrenceStartISO}` ``, series-level `uid`, `title`/`start`/`end`/`allDay`, indexes on userId + sourceId, cascade); adds an `external` value to the `EventType` enum. Imported calendars: BUSY-mode events resolve to busy blocks that carve the slot fabric like fixed events, never persisted to engine output; mirrored into the `externalCalendar` Redux slice OUTSIDE the OCC diff sync. See "External calendars" in the domain model.
  - `add_google_calendar_connection` — `GoogleCalendarConnection` (one per user, `@unique userId`, stores the offline Google OAuth `refreshToken` + display `email`, cascade delete). Backs the Google Calendar OAuth flow (`app/api/integrations/google/{connect,callback}`); `GOOGLE`-kind `ExternalCalendarSource`s are created from the connection and dropped when it is disconnected. Independent of the login provider (credentials users can connect too).
  - `add_habit` — added `habit` to the `PlannerType` enum + `HabitCompletion` (one row per completed occurrence, `@@unique([plannerId, occurrenceKey])`, cascade on planner + user). Superseded by `retire_habit_type_add_habit_trackers` below; the completions table survives as the occurrence-completion log.
  - `add_microsoft_calendar_connection` — `MicrosoftCalendarConnection` (one per user, `@unique userId`, stores the Microsoft OAuth `refreshToken` + display `email`, cascade delete). Backs the Microsoft Graph calendar flow (`app/api/integrations/microsoft/{connect,callback}`); `MICROSOFT`-kind `ExternalCalendarSource`s are created from the connection and dropped when it is disconnected. Microsoft rotates refresh tokens (persisted on every Graph fetch) and offers no revoke endpoint for consumer grants (disconnect is a local delete).
  - `retire_habit_type_add_habit_trackers` — habits become a tracking layer over ordinary planner items. New `Habits` (name, `color?`, bucket `categoryId?` SetNull, cascade with user) + `HabitItems` (`@@unique([habitId, plannerId])`, cascade on habit/planner/user) tables; every habit-typed planner row retyped to `task` (recurrence/allowedTimes/duration/splitting kept — scheduling behavior unchanged, completion keys stay valid since they anchor to the immutable `createdAt`), with one tracker minted per old row (planner id reused as habit id) linking to the retyped task; `habit` dropped from the `PlannerType` enum (retype dance across `Planners` + `EventExtendedProps`). The Prisma model `HabitCompletion` was renamed `OccurrenceCompletion` in code only (`@@map("HabitCompletions")` — no table rename); it now also logs recurring-goal leaf periods and plan check-offs. See "Flexible recurrence" in the domain model.
  - `add_habit_buckets` — `HabitBuckets` (name, `color?`, `sortOrder`, cascade with user): the habits surface's own grouping entity, distinct from the item Category tree. `Habits.categoryId` is replaced by `Habits.bucketId` (SetNull — a deleted bucket leaves its habits unsorted); every category referenced by an existing habit seeded one bucket (id, name, and color copied) before the column swap, so no habit lost its grouping.
  - `add_feedback` — `FeedbackReports` (support message + optional `dataSnapshot` Json: the exportUserData blob captured at report time when the user consented via the feedback form's checkbox; read by the admin inspector, clearable per report once resolved), `Suggestions` + `SuggestionVotes` (`value` +1/-1, `@@unique([suggestionId, userId])` = one vote per user) — the suggestion wall. All cascade with the user; all outside the OCC diff sync.

  Prisma 7 requires a driver adapter at construction. Both `lib/db.ts` and `prisma/seed.ts` use `PrismaPg`. Don't construct `PrismaClient` without one.

  ---

  ## Environment variables

  Required in `.env`:

  ```
  NEXT_PUBLIC_APP_URL="http://localhost:3000"
  NEXTAUTH_SECRET=""
  DATABASE_URL=""                     # Pooled, used by the app
  DIRECT_URL=""                       # Direct, preferred by the seed for bulk writes
  GITHUB_CLIENT_ID=""
  GITHUB_CLIENT_SECRET=""
  GOOGLE_CLIENT_ID=""                 # OAuth login AND Google Calendar import (see note below)
  GOOGLE_CLIENT_SECRET=""
  GOOGLE_MAPS_API_KEY=""              # Places API (New) + Routes API (computeRouteMatrix)
  MICROSOFT_CLIENT_ID=""              # Microsoft Graph calendar import (optional — see note below)
  MICROSOFT_CLIENT_SECRET=""
  RESEND_API_KEY=""
  # ANTHROPIC_API_KEY is NOT required: the AI assistant is BYOK — each user's
  # own key, stored on their device, calling Anthropic from the browser.
  # (Reserved for the future MANAGED mode's server-side proxy.)
  ```

  The Google Calendar integration adds **no new variable** — it reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and `NEXT_PUBLIC_APP_URL`. But the Google Cloud OAuth client must have the **Calendar API** enabled with the `https://www.googleapis.com/auth/calendar.readonly` scope, and a **second authorized redirect URI** registered: `${NEXT_PUBLIC_APP_URL}/api/integrations/google/callback` (distinct from the NextAuth callback).

  The Microsoft Calendar integration needs its own app registration (Microsoft Entra admin center → App registrations, supported account types "Accounts in any organizational directory and personal Microsoft accounts", i.e. common tenant): `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` come from it, with the **Web** redirect URI `${NEXT_PUBLIC_APP_URL}/api/integrations/microsoft/callback` and delegated Graph permission `Calendars.Read` (+ `openid`, `email`, `offline_access`). No admin consent needed. When the variables are unset the Connect Microsoft button fails with "Microsoft OAuth credentials are not configured"; ICS import is unaffected.

  ---

  ## Adding new features

  ### A new server action
  1. Add a file under [actions/](actions/) with `"use server"` at the top.
  2. Call `auth()`, scope every query by `session.user.id`.
  3. If it mutates rows the diff layer tracks, call `markSynced(...)` on the next render or you'll get phantom diffs.

  ### A new Prisma model
  1. Add a new file in [prisma/schemas/models/](prisma/schemas/models/) and reference it in `schema.prisma` if needed.
  2. `pnpm prisma:migrate:dev --name <descriptive_name>`.
  3. `pnpm prisma generate`.
  4. Add type re-exports in [types/prisma.ts](types/prisma.ts) (note: `.ts`, not `.d.ts`).
  5. If the model is engine output, give it a deterministic id and write wholesale on each regen — see CategoryEvent / TravelEvent for the pattern.

  ### A new scheduling strategy
  See [documentation/calendar-generation-deep-dive.md](documentation/calendar-generation-deep-dive.md#10-strategies). Implement the interface, add a weight constant in `defaultStrategy.ts`, wire it in via `buildSchedulingStrategy`.

  ### A new UI primitive
  1. Put it under [components/ui/](components/ui/) with a co-located `*.css.ts`.
  2. Add the export to [components/ui/index.ts](components/ui/index.ts).
  3. Use design tokens via `vars` from [lib/theme](lib/theme); avoid hardcoded colors.

  ### A new page
  1. Add it under `app/(protected)/<route>/page.tsx`; the protected layout already wires the providers and the AppShell.
  2. If it should appear in the desktop or mobile nav, add it to `NAV_ITEMS` / `MOBILE_TABS` in [components/ui/shell/nav.ts](components/ui/shell/nav.ts).

  ---

  ## Tests

  Engine regression tests live in [`__tests__/calendar-generation/`](__tests__/calendar-generation/):

  - **expansion-seam** — guards the local-date-keyed `CategoryEvent` ID format by forcing horizon expansion (a single Plan three weeks out). The diff layer and the DB schema depend on this composite ID; UTC-instant keying would desync near midnight UTC.
  - **completed-task-not-rescheduled** — a completed task under a ready goal must render only at its completion window, never re-enter the candidate list (guards the `prepareCandidates` completed filter).
  - **ready-gate** — readiness is the universal scheduling gate: a NOT-ready goal's subtree schedules nothing (its tasks are never individual candidates), a ready-marked standalone task places, and a NOT-ready standalone task does not. Readiness cascades: `toggleGoalIsReady` / `setGoalIsReady` / the assistant apply / `addSubtask` stamp the whole subtree with the root's value. Tasks/plans default ready on every create surface (`defaultReadyForType`); goals stay unready until they have subtasks + a deadline or repeat rule.
  - **ready-goal-watermark** — a ready goal must place every leaf despite the three watermark starvation modes: subtree-aggregate sizing (goals size as their largest uncompleted, still-placeable leaf), a windowless classification-only `categoryId` (the watermark resolves constraints against the same window-bearing category set placement uses), and a memoized past leaf inflating the goal's size. An exhausted expansion budget must surface `NO_SLOTS` failures instead of exiting silently.
  - **stable-regen** — an idle regen must produce an empty diff: unchanged placements return the previous emit by object identity (`stabilizeEvent`), and a plan `starts` drag re-derives rather than memoizes.
  - **category-window-cascade** — window-eligibility membership: items schedule in ancestor windows via the upward cascade, never in descendant windows, with `confineToOwnWindows` acting as both opt-out and ceiling.
  - **recurring-plan-events** — `buildPlanEvents` expansion: deterministic composite occurrence ids, moved/deleted exceptions applied, and identity-stable re-emits across regens.
  - **recurring-item-scheduling** — flexible recurrence (hand-built inputs): a weekly task places exactly one occurrence per period inside its own week (placementWindowEnd), occurrences win contested slots by priority and are skipped SILENTLY when they lose (no engine message), a logged completion freezes at its window while later periods still schedule, TOO_LARGE coalesces to the base row, past uncompleted occurrences vanish (never memoized), recurring GOALS clone their subtree per period (leaves chain in sibling order inside each week; a logged leaf-period freezes with siblings still placing; a fully logged period emits only frozen tiles), period keys stay stable across weekStartDay changes (createdAt-anchored), a >400-day-old daily item still schedules its present-day occurrences, and idle regens re-emit identical events.
  - **category-window-recurrence-exceptions** — per-occurrence window exceptions: a deleted occurrence vanishes from BOTH the materialized CategoryEvents and the slot fabric (a window-constrained task skips the vacated day), a moved occurrence keeps its original-date id while relocating fabric + placement, single emission across horizon expansion, plus `expandCategoryWindowPeriods` unit cases (vacate, containing-range emission, overnight duration, malformed JSON).
  - **split-task-scheduling** — split tasks (hand-built inputs): full duration placed as chunks within [min, max], per-day cap honored, completed segments frozen while only the remainder reschedules, a fully covered task emits segments only, an unsplittable remainder places whole with a `SPLIT_CONSTRAINT_RELAXED` row, a splittable goal leaf chains the next leaf after its last chunk, and an idle regen re-emits identical chunk events.
  - **goal-day-cap** — the goal daily cap (hand-built inputs): no local day carries more subtree minutes than the cap, a split leaf under a capped goal takes the min of both budgets (a plain sibling counts against the same ledger), an oversized leaf places whole with a `GOAL_DAY_CAP_RELAXED` `oversizedLeaf` row while siblings stay capped, completed-today history seeds the ledger so siblings avoid the spent day, and an idle regen re-emits identical events.
  - **scheduling-constraints** — per-item placement bounds (hand-built inputs): an earliest start date is never violated (with an unconstrained control proving earlier room existed), allowed weekdays / time-of-day ranges confine placement, the two compose (first allowed day at or after the date), a goal root's allowed times bind every leaf, a duration no allowed block can host emits `TASK_TOO_LARGE` instead of hunting, an allowed-times pattern that never overlaps the item's category windows emits `TASK_UNSCHEDULABLE(IMPOSSIBLE_CONSTRAINTS)` with zero placement (an overlapping control proves the gate stays open), the template-intersection gates fail loud as `TASK_TOO_LARGE` (a block no allowed x template fragment can host, category windows fully template-covered, the residual window fragment minus the trailing buffer, and the empty allowed x windows x template triple whose every pairwise projection is non-empty) while overnight allowed ranges and overnight windows place across midnight un-gated (the per-day-sampling guards), and an idle regen re-emits identical placements. Plus travel coalescing under constraints: consecutive same-location leaves of a day-constrained goal chain with exactly one outbound and one return leg (absorb slide legal), and a bound inside the freed travel span still removes the redundant leg without back-extending the task past its bound (no-slide tier).
  - **queue-sequence** — queue (pipe) precedence (fixture pattern): members place in order (second ≥ first's end, task→goal chains into the first leaf), completed and unready-goal members chain through silently, a TOO_LARGE member breaks the chain with exactly one deduped `QUEUE_SEQUENCE_BROKEN` while later members place FIFO, a member blocked behind a far-future predecessor waits through horizon expansion instead of jumping the chain, and an idle regen re-emits identical events.
  - **dependency-gate** — dependency precedence (fixture pattern): a two-predecessor goal starts after the LATER predecessor's end, completed predecessors are transparent, an unready-goal predecessor schedules the successor unbounded with one `DEPENDENCY_BROKEN(cause: unready)`, a permanent failure reports `cause: failed`, pure budget exhaustion emits `SEQUENCE_PAST_HORIZON` instead, a pipe stalls at a member with an external dependency (FIFO preserved), and an idle regen re-emits identical events.
  - **precedence-constraints-compose** — precedence × per-item features (hand-built inputs): max wins between the bound and the successor's own earliest start, a split predecessor bounds the successor to its LAST chunk, a day-capped goal predecessor bounds to the spread subtree's last placed end, and a bounded successor with allowed times lands in the first allowed fragment at or after the bound.
  - **queue-category-inheritance** — a categoryless member inherits the queue's strict windowed category, a member with its own category keeps it, plus `applyQueueCategoryInheritance` unit cases (identity no-op, root-only substitution).
  - **precedence-edges** — the GATED edge builder: sortOrder ordering, transparency chain-through, defensive re-filtering, unready-dependency retention, empty/singleton queues, multi-predecessor map shape. (The validation-graph builder is covered separately in `__tests__/utils/precedence/` — findCycle, readinessBlockers, prunePrecedenceInputs, detourLinks, and nodeDependencies for the node-level validators: same-root hard refusal, loops through internal step orders, `validateSubtreeOrder` accept/refuse/skip, internal-hop cycle descriptions. Draft-layer node-edge safety is in `__tests__/draft/nodeDependencyDraftSafety`; promote/demote helpers in `__tests__/utils/promoteSubtree` + `demoteRootIntoGoal`.)
  - **node-dependency-gate** — node-level dependency edges (fixture pattern): a cross-goal subtask→subtask bound honored, goal→subtask and subtask→goal variants, a completed predecessor node transparent while others still bind, an unready-root interior predecessor emitting one `DEPENDENCY_BROKEN(unready)` carrying the NODE id, a split predecessor bounding its successor to the LAST chunk, a stale day cap on a nested goal row never activated by anchor registration, a blocked node successor surviving horizon exhaustion with `SEQUENCE_PAST_HORIZON`, and an idle regen re-emitting identical events.
  - **detour-splice** — detours (hand-built inputs): a linked target's leaves splice into the host sequence at the placeholder position (chained, placeholder never scheduled, target placed once), a target referenced by two hosts places once after BOTH hosts' before-leaves (multi-reference), the host and target day caps compose pointwise-min on spliced leaves, a target whose only host is completed schedules independently, an unready target never schedules through a ready host (transparent splice, loud `DEPENDENCY_BROKEN(unready)` preserved), a leaf oversized only for the target cap still steers under the host cap with the `oversizedLeaf` compromise attributed to the target alone, children under a linked placeholder schedule after the splice, a dependency successor bounds on the target's last spliced leaf, and an idle regen re-emits identical events. (Enumerator + validation + prune are unit-tested in `__tests__/utils/precedence/detourLinks` — spliced sequence, cycle guard, dangling link, transparent unready/completed targets, placeholder children, task-entry semantics, `canLinkAsDetour`/`wouldCreateDetourCycle` including queue/dependency contradictions, `prunePlannerDetours` identity; detour component contraction in the queue/dependency validators is covered in `__tests__/utils/precedence/findCycle`.)
  - **flat-order-parity** — behavior-parity guards for the leaf-Kahn loop against the old candidate walk (hand-built inputs): a category-constrained item keeps first pick over higher-scored unconstrained work, a successor chains after a split leaf's earlier-pass chunks when the leaf later fails permanently (chunks also proven inside their allowed fragments), a queue successor stays bounded behind a member whose leaves are all completed, and a root task with children places its own duration alongside its independent children.
  - **external-busy-blocks** — imported external-calendar events resolve (through the real `deriveExternalBusyEvents` + mode/exception resolution) to busy blocks that carve the free-slot fabric like fixed events (tasks are pushed off busy windows) while never leaking into the engine's persisted output.
  - **expansion-without-categories** — horizon expansion must extend a category-free fabric (no CategorySlot to carry the `isFinal` pickup marker), deriving the growth target from the current horizon end so a task needing room past the first chunk places instead of failing `NO_SLOTS`.
  - **static-travel-pass** — direct-drive tests of `staticEventTravelPass` on a hand-built slot fabric: entry travel that exactly consumes its category still emits the next category's entry edge, cascade fallbacks keep the leg ledger balanced, whole-minute boundary splits at category bleeds, absorbed category time never resurfaces as leading Available, and no zero-duration slots survive.
  - **template-recurrence-exceptions** — `masksToIntervals` applies per-occurrence template moved/deleted exceptions (keyed by the occurrence's original local start).
  - **templates-to-event-input** — `templatesToEventInput` renders a template as one editable recurring event, excluding deleted occurrences via `exdate` and emitting one-off moved events from `recurrenceExceptions`.
  - **zero-duration-validation** — `validatePlanner` treats a zero-duration item (e.g. a goal retyped to task) as a warning, not a hard error that would blank the calendar.

  Non-engine unit suites live alongside: [__tests__/external-calendar/](__tests__/external-calendar/) (ICS parse, Google + Microsoft Graph event mapping, ICS-URL normalization, busy-block derivation + mode exceptions), [__tests__/mindmap/](__tests__/mindmap/) (`buildMindmapTree`/`layoutMindmap`/zoom conversions), [__tests__/hooks/](__tests__/hooks/) (`useCanvasGestures`), [__tests__/calendar/](__tests__/calendar/) (WeekStructureModal overnight windows), [__tests__/draggable/](__tests__/draggable/) (touch drop-target resolution), and [__tests__/onboarding/](__tests__/onboarding/) (pure builders).

  Most full-pipeline tests (completed-task-not-rescheduled, ready-gate, ready-goal-watermark, stable-regen) run against trimmed live-data snapshots in `fixtures/` — synthetic minimal fixtures rarely produce a valid slot fabric, so new tests that exercise the whole scheduler should extend the fixture pattern rather than hand-building planners (expansion-seam, category-window-cascade, and category-window-recurrence-exceptions are the deliberate exceptions: they run `generateCalendar` on hand-built minimal inputs shaped for their specific geometry). recurring-plan-events is a module-level unit test of `buildPlanEvents` — no slot fabric needed. Tests use jest fake timers (`{ doNotFake: ["queueMicrotask"] }` + `setSystemTime`) for a deterministic "now", and map fixture template `startDay` weekday names to the integers the engine expects.

  Run with `pnpm test` / `pnpm test:watch`. Type-checking covers both the app and the test project: `pnpm type-check` (also chained into `pnpm lint`). One jest quirk: `@/` aliases resolve through next/jest's SWC transform, which rewrites `import` statements but NOT the string literal inside `jest.mock(...)` — a mocked module must be named with a RELATIVE specifier (see `__tests__/draft/assistantEngine.test.ts`).

  ---

  ## Notes for future work

  - The legacy `utils/category-constraints/` folder (a vestige from when `Category.timeSlots` was a JSON column) has been removed. The constraint surface lives in the `CategoryTimeWindow` table + the engine's slot geometry.
  - Default to functions over classes when extending the engine; the core classes (`CalendarGenerator`, `Scheduler`, `TimeSlotManager`, `TravelManager`) earn their class form because they own real state. Adding a new class for "tidiness" without a polymorphism / invariant / multi-instance justification is class creep.
  - `notes/` is personal scratch — don't quote it as documentation, and don't add summary/changelog files there.

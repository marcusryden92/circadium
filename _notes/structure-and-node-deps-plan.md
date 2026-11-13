# Promote / Demote / Node-level dependencies — implementation plan

**STATUS (2026-07-17): ALL PHASES IMPLEMENTED** on branch `feature/structure-and-node-deps` — Phase 0 (shared endpoint predicate in utils/precedence/endpoints.ts), Phase 1 (promoteSubtree + EditDrawer entry), Phase 2 (demoteRootIntoGoal + item-detail card — shipped as PRESERVE-and-revalidate for dependency edges, not enumerate-and-drop, since F1 landed in the same release and the relaxed prune keeps them; the helper refuses same-goal/cycle-manufacturing demotes), Phase 3a–3d complete. `pnpm lint` + full suite green; CLAUDE.md updated (domain model + tests). Deviations from the letter of the plan: `wouldCreateCycleAddingNodeDependency` returns `"same-root" | cycle | null`; the reorder guard is a `MovePrecedenceGuard` threaded from DraggableContext (banner rendered there); the nodeIdMap replaced rootIdMap by rename. Manual in-browser pass not yet run.

Authored 2026-07-17 from a full multi-agent codebase audit. Product decisions below are FINAL
(signed off by Marcus). This document is self-contained enough to hand to a fresh agent, but the
implementer must still read CLAUDE.md in full, plus documentation/calendar-generation-deep-dive.md
sections 6 and 8 (flat-order scheduling, precedence gate) and notes/precedence-plan.md before
touching anything. File references use paths + function names, not line numbers (they rot).

The three features:

- **F2 Promote** — break a subtree out of a goal so it becomes its own root-level goal.
- **F3 Demote** — nest an existing root-level goal as a subtree of another goal.
- **F1 Node-level dependencies** — allow PlannerDependency edges between arbitrary tree nodes,
  not just roots: subtask→subtask across goals, goal→subtask, subtask→goal.

Implement in phase order (0 → 1 → 2 → 3). Each phase is independently shippable. Definition of
done per phase: `pnpm type-check` clean, `pnpm test` green, the new tests listed under each phase
written and passing.

---

## Locked product decisions

**F2 (Promote):**
- A promoted **childless** node (goal-typed by `addSubtask` convention) is retyped to `task` and
  gets `defaultReadyForType("task")` (= ready). A promoted node WITH children stays a goal.
- Ancestor `earliestStartDate` / `allowedTimes` constraints and ancestor-chain location
  inheritance are DROPPED (they are live-resolved, not stored) — surfaced in a lightweight
  informational confirm, never snapshotted onto the row.
- Promote is a native Redux mutation only. Never routed through the AI draft contract.

**F3 (Demote):**
- v1 ships with an enumerate-and-drop ConfirmModal (queue membership, dependency edges both
  directions, inbound detour links) — the central prune then executes the drops. Built behind the
  shared endpoint predicate so the F1 flip later turns dependency-edge handling into
  preserve-and-revalidate with a one-site change.
- The dirty-assistant-modal duplication hazard is documented, not mitigated, in v1.

**F1 (Node-level dependencies):**
- **Queues stay root-level.** Queue members and detour targets keep the root-only rule forever
  (one-queue-per-planner and lane semantics do not survive node membership).
- **Same-goal edges are banned outright** — hard refusal when both endpoints share a structural
  root (a goal's leaves are already totally ordered by sibling order; a same-goal edge is either
  redundant or a guaranteed deadlock). This includes root↔own-subtask.
- **Loud failure semantics**: node-level edges get dependency-grade `DEPENDENCY_BROKEN` engine
  messages (the gate-lane implementation), not silent chain pass-through.
- **Root urgency only in v1**: the score lift for a node edge carries the successor's ROOT
  urgency. A subtask's own deadline driving priority inheritance is a new concept — out of scope.
- **Authoring UI**: a search/browse picker modal showing item hierarchy as breadcrumbs;
  prohibited options are ghosted/red with the reason ("same goal — order is set by the list" /
  "would create a loop"). Commit-time hard check stays regardless.
- **Reorder validation is required, not optional.** With same-goal edges banned, a loop can still
  thread through TWO goals' internal orders: edges "B4 after A5" + "A8 after B7" with internal
  order A5<A8 and B4<B7 are individually legal, but dragging A8 above A5 creates
  A8→A5→B4→B7→A8. The hook is cheap and skippable when the touched subtree carries no
  node-level edge endpoint (the common case).
- Assistant AUTHORING of node edges is deferred; the draft layers are only changed enough to not
  destroy user-authored node edges (Phase 3d — mandatory, same release as the first authoring
  surface).

---

## Terminology

- **Edge** — one `PlannerDependency` row `{predecessorId, successorId}`. **Endpoints** — the two
  planner rows it connects. Today both endpoints must be roots; F1 relaxes this for dependencies
  only.
- **Node** — any planner row in a tree. **Root** — `parentId == null`. **Structural root of X** —
  `getRootParentId(planner, X.id) ?? X.id` ([utils/goalPageHandlers.ts](../utils/goalPageHandlers.ts)).
- **Internal chain** — the total order of a goal's bottom-layer leaves given by the sortOrder DFS
  (`getSortedTreeBottomLayer`). The engine already materializes it as consecutive-pair chain
  edges in `buildLeafGraph`; the authoring-time validators currently do NOT see it (that gap is
  the heart of Phase 3a).

---

## Phase 0 — extract the shared endpoint predicate

Pure refactor, zero behavior change. The rule "a precedence endpoint must be an existing,
root-level, triaged, non-plan item" is currently implemented independently in five layers.
Extract it once so later phases have a single flip point.

1. In [utils/precedence/prunePrecedenceInputs.ts](../utils/precedence/prunePrecedenceInputs.ts),
   `isValidPrecedenceEndpoint` is already the canonical shape. Export it (move it to a small
   shared module in `utils/precedence/` if import cycles demand — check before moving).
2. Consume it (replacing the local copies, composing any extra site-specific filters like
   `!plannerIsCompleted` on top) in:
   - [utils/calendar-generation/helpers/Scheduler/precedenceEdges.ts](../utils/calendar-generation/helpers/Scheduler/precedenceEdges.ts) — `isEligibleEndpoint`
   - [utils/draft/draftPrecedenceOps.ts](../utils/draft/draftPrecedenceOps.ts) — op endpoint eligibility
   - [utils/draft/applyDraftPrecedence.ts](../utils/draft/applyDraftPrecedence.ts) — `validEndpointIds`
   - [utils/draft/draftPrecedence.ts](../utils/draft/draftPrecedence.ts) — the working-copy prune
   - UI pickers: SideCards dependency picker, AddMemberModal queue candidates, EditDrawer detour
     target picker (these add their own display filters on top)
   Caveat: the draft-domain copies operate on DraftForest shapes, not Planner rows — where the
   row shape differs, share the LOGIC via a tiny adapter rather than forcing one signature.
3. `isValidDetourTarget` in [utils/precedence/detourLinks.ts](../utils/precedence/detourLinks.ts)
   stays separate and root-only permanently (decision above).
4. All existing tests must pass unchanged.

Estimated scope: ~6 files, no new tests (existing suites are the guard).

---

## Phase 1 — F2 Promote

### Mutation helper

New `promoteSubtree(planner: Planner[], itemId: string): Planner[] | { error: string }` in
`utils/goal-handlers/` (pure, immutable, `plannerBulkActions` style). Steps, in order:

1. **Refusals**: item not found; item is already a root; item is plan-typed (the item-detail
   type picker can retype any subtask to plan).
2. **Pre-resolve** (BEFORE mutating): `resolvedCategory = getEffectiveCategoryId(planner, itemId)`
   (the parent-chain walk in utils/goalPageHandlers.ts — do NOT pass the queue lookup; queue
   category inheritance is not a structural property), and the old structural root id.
3. **Patch the promoted row**: `parentId: null`, `sortOrder: 0` (root convention — top-level
   order is non-semantic), `isTriaged: true` (defensive; candidacy, precedence eligibility, and
   the AI forest all gate on it), `categoryId: resolvedCategory` (the root-only invariant:
   without this the subtree silently loses category, strict-window eligibility, and
   category-location inheritance), `linkedItemId: null` (a root-level detour placeholder is a
   configuration no validator admits — clear it), `color: row.color ?? old root's color ??
   deterministic fallback` (the pattern is `resolveNewRootColor` in
   utils/draft/applyDraftForestToPlanner.ts — module-private, replicate rather than import; a null
   color renders the red `calendarColors[0]` fallback), `updatedAt: now`.
   Never null out `duration` — a missing duration on a non-goal row is a HARD validation error
   that blanks the entire calendar (`validatePlanners`); zero is only a warning.
4. **Type + readiness**:
   - Childless → retype to `task`, `isReady = defaultReadyForType("task")` (true).
   - Has children → stays `goal`; `isReady = (hasChildren && deadline != null) ? carried
     cascaded value : false`, then stamp the resolved value over the WHOLE subtree
     (`toggleGoalIsReady` cascade pattern — readiness is a whole-subtree property; do not use
     `checkGoalForCompletion`, its deadline check is vacuous).
   - Descendants: keep their fractional sortOrders (local to their parentId groups), keep
     categoryId null (already null per invariant).
5. **Emptied-source fixup**: if the OLD root is now childless and goal-typed, set its
   `isReady: false` (mirror the `deleteGoal` fixup in utils/goalPageHandlers.ts — a childless
   ready goal root is its own bottom-layer leaf and starts scheduling its own stale duration).

### Dispatch & persistence

Dispatch through `updatePlannerArray` → `updateAllCalendarStates` so the thunk's central
pruning, the regen, and ONE debounced OCC sync all see the same snapshot. Zero new sync
plumbing — parentId/sortOrder/categoryId/isReady/isTriaged/linkedItemId/color are all in the
plannerHandlers bulk-update column list and the planner diff is value-based. Zero engine
changes — the promoted root becomes a candidate next run by construction; memoized past events
of its leaves survive by planner-id identity.

### UI

"Promote to top level" action in the subtasks EditDrawer footer next to Delete/Duplicate
(follow the `duplicateSubtree` precedent: run the helper, dispatch, navigate to
`/items/[itemId]`). Lightweight informational ConfirmModal (existing `ConfirmModal` primitive)
noting: the item adopts category "X" as its own; inherited time constraints and location from
its old parents no longer apply. Promote destroys nothing — no loss enumeration needed.

### Tests

Unit tests for the helper in `__tests__/utils/` (hand-built planner arrays, the
plannerBulkActions test style): id preservation (same row object id before/after), category
stamping from each resolution tier (own / ancestor / none), childless retype + ready,
with-children readiness gate both ways + subtree cascade, emptied-source fixup, plan refusal,
root refusal, linkedItemId clearing, color fallback. Optional: one fixture-pattern engine
regression proving a promoted ready goal schedules as an independent candidate.

Scope: ~5–7 files.

---

## Phase 2 — F3 Demote

### Mutation helper

New `demoteRootIntoGoal(planner: Planner[], rootId: string, targetRootId: string):
Planner[] | { error: string }` in `utils/goal-handlers/`:

1. **Refusals**: source not found / not a root; source is plan-typed (a nested plan
   double-renders: `buildPlanEvents` places it at its anchor regardless of parentId while the
   bottom-layer walk counts it as a leaf); target not found / not a root / plan-typed / equal to
   source. v1 attaches as the LAST child of the target root (append); attaching under a deeper
   node is a follow-up.
2. **Patch the demoted row**: `parentId: targetRootId`, `sortOrder: appendKey(...)` from
   [utils/goal-handlers/sortOrderKeys.ts](../utils/goal-handlers/sortOrderKeys.ts) over the
   target's current child group (apply any group reindex in the same immutable update),
   `categoryId: null` (CRITICAL — resolution is own-value-first in `buildPlannerCategoryMap`, so
   a kept stale value would pin the whole subtree to the old category including strict windows;
   descendants are already null), `maxMinutesPerDay: null` (runtime-inert on nested rows but the
   draft contract would silently heal it later — clear it so row and contract agree),
   `updatedAt: now`. Keep `plannerType: "goal"` (nested goal-typed rows are the norm — every
   `addSubtask` row is goal-typed). Keep `duration` as-is (never null it).
3. **Readiness**: stamp the TARGET root's `isReady` over the ENTIRE demoted subtree (demoted
   root included) — mixed flags inside one tree are latent corruption (the engine reads only the
   root flag; the next cascade would surface it unpredictably).

### Loss manifest + confirm

BEFORE dispatch, compute and show in a ConfirmModal:
- the demoted root's queue membership (queue title),
- dependency edges in both directions (peer titles),
- inbound detour links (placeholders elsewhere whose `linkedItemId` is the demoted root — their
  hosts' titles),
- detour placeholders INSIDE the demoted subtree (their targets' titles) with a note that their
  ordering context changes (host-side contradiction re-check against the new root's
  queue/dependency paths is a stretch goal; the engine's deadlock force-fail is the backstop).

Note in the copy that dependency edges cannot be restored by promoting back later (immutable
create/delete rows). On confirm, dispatch through `updatePlannerArray` → thunk: the central
prune drops members/edges/links in the SAME Redux snapshot → one diff → one OCC transaction. Do
NOT write any prune logic in the helper — the thunk's central prune IS the executor. Never
dispatch a demote through any path that bypasses `updateAllCalendarStates`.

### UI

Entry points: item-detail (root goals) and/or the library ItemRow kebab. Target picker: root
goals excluding self and plans (Combobox precedent from the detour picker). On success navigate
to the target's subtasks tree (the demoted goal vanishes from the library and graph — both are
root-keyed — so the navigation is the discoverability affordance).

### Tests

Helper unit tests: invariant clears (categoryId, maxMinutesPerDay), host-readiness stamp over
the subtree, append sortOrder key + reindex path, plan/self/non-root refusals, duration
untouched. The existing prunePrecedenceInputs tests already cover nested-as-drop. Optional
fixture regression: a demoted subtree schedules under the host's gate; its former dependency
peers schedule unbounded.

Scope: ~6–10 files.

---

## Phase 3 — F1 Node-level dependencies

Ship as one feature over four sub-phases; 3a+3b+3d must land in the SAME release as the first
authoring surface (3c), or edges self-destruct (see hazards).

### 3a — legality layer (utils/precedence/)

1. **New source variant**: `PrecedenceSource` gains `"internal"`
   ([utils/precedence/types.ts](../utils/precedence/types.ts));
   [describeCycle](../utils/precedence/describeCycle.ts) renders internal hops as
   "through <goal title>'s step order".
2. **Internal chains join the legality graph**: `collectValidationEdges` additionally emits,
   per root, consecutive-pair `internal` edges over the root's sortOrder-DFS bottom layer
   (`getSortedTreeBottomLayer` — structural order; detours are handled by contraction, not by
   splicing here). Completed leaves are INCLUDED (validation uses full logical order — the
   un-completing-resurrects-a-cycle doctrine; do not reuse a scheduling-only enumerator that
   skips completed).
3. **Endpoint expansion**: an edge endpoint that is a non-leaf node expands to its subtree's
   boundary leaves — predecessor → last leaf of its subtree, successor → first leaf. Root
   endpoints (existing dependency + queue-chain edges) expand the same way so the whole graph
   lives at leaf granularity. A childless node is its own bottom layer (`getTreeBottomLayer`
   returns `[self]`), so the expansion is uniform.
4. **Detour contraction composes**: every contraction site must resolve
   node → structural root (`getRootParentId`) → detour representative before lookup (today
   `repr.get(id) ?? id` silently misses non-root ids), and post-contraction, intra-component
   edges that became self-loops must be dropped (findCycle treats `fromId === toId` as a cycle).
   This keeps the existing root-granular contraction doctrine; the fidelity loss (a contracted
   component's internal order is invisible to cross-component checks) matches what the system
   already accepts for detours today — document, don't fix, in v1.
5. **New validators**: `wouldCreateCycleAddingNodeDependency(planner, queues, dependencies,
   predecessorId, successorId)` — hard-refuse same-structural-root pairs FIRST (cheap, before
   any graph walk), then findCycle over the extended graph.
   `validateSubtreeOrder(planner, queues, dependencies, rootId)` — whole-graph
   `findCycleInGraph` for post-move states (reorder, demote): rebuild internal chains from the
   proposed planner array and report the closing path. Skip entirely when no node-level edge has
   an endpoint inside the touched root's subtree.
6. **Prune relaxation** (the five-layer flip, part 1): add
   `isValidDependencyEndpoint(planner, byId)` alongside the root predicate: endpoint row exists,
   `plannerType !== "plan"`, and its STRUCTURAL ROOT is triaged and non-plan. `pruneDependencies`
   switches to it; `pruneQueueMembers` and `prunePlannerDetours` keep the root predicate.
   Completed/unready endpoints remain members (transparency affects gating, never membership).

### 3b — engine

1. **Gated edge builder** ([precedenceEdges.ts](../utils/calendar-generation/helpers/Scheduler/precedenceEdges.ts)):
   dependency endpoints relaxed to the node predicate (queues unchanged). Emitted edges carry
   node ids.
2. **buildLeafGraph** ([buildLeafGraph.ts](../utils/calendar-generation/helpers/Scheduler/buildLeafGraph.ts)):
   register each node that appears as a dependency endpoint as a **gate anchor** — its first/last
   own leaf within its root's already-built leaf sequence (a node's subtree is a contiguous
   subsequence of the root's DFS order). CRITICAL SPLIT: gate-anchor registration must NOT feed
   `completionRoots` / the day-cap path — `goalCapFor` consults `maxMinutesPerDay` for every
   tracked id with only a plannerType check, so naive reuse of `registerRoot` silently activates
   stale day caps on nested goal rows, violating the documented "stale caps on nested rows are
   inert" invariant. Either a parallel node-anchor registry or a `parentId == null` filter at
   `goalCapFor`. Score lift generalizes: lift `lastOwnLeaf(pred) → firstOwnLeaf(succ)` with the
   successor's ROOT urgency (decision: root urgency only in v1); backward propagation over chain
   edges is automatic.
3. **precedenceGate** ([precedenceGate.ts](../utils/calendar-generation/helpers/Scheduler/precedenceGate.ts)):
   generalize outcomes from root-keyed to anchor-keyed:
   - **Seeding for absent predecessors** (the deadlock trap — an edge naming a predecessor not
     in this run's pool must be pre-resolved BEFORE the loop or it blocks forever and burns the
     entire expansion budget): completed node → `plannerCompletedEnd` (completedEndTime or last
     completedSegments end); node with memoized/past subtree events → scan
     `context.scheduledEvents` for events whose `plannerIdFromEventId` resolves into the node's
     subtree leaf-id set, take max end (the `seedGoalDayLedger` pattern); node under an unready
     root → outcome failed with cause `unready` — the cause must come from WALKING TO THE
     CONTAINING ROOT and checking its readiness (the current code inspects the endpoint row
     itself, which for a task-typed subtask would mis-stamp cause `failed`).
   - **Successor bound**: max over node-predecessor resolved ends, applied as the gate on the
     successor node's FIRST own leaf, riding the existing `afterTime` seam (composes with
     `earliestStartDate`/`allowedTimes`/chain ends for free).
   - **Node resolution**: a predecessor node resolves when all leaves of its subtree resolve;
     its published end is the max placed end (generalize the rootLeafCount/rootLastEnd
     bookkeeping per anchor; `leafPlacedEnd` already carries split-leaf last-chunk ends).
   - **Loud breaks**: permanent predecessor failure → successor schedules unbounded +
     `DEPENDENCY_BROKEN` (causes `failed`/`unready` preserved). Include the node id in the
     message identity tuple; [renderEngineMessage.ts](../utils/renderEngineMessage.ts) resolves
     the node title from the current planner array (append the root title as context:
     "Step X of Goal Y").
4. **Loop safety**: fold node-gate blockage into the watermark's
   `chainBlocked || crossBlocked` skip (blocked leaves must not inflate `biggestRemaining` and
   trigger expansions they cannot use), and extend the zero-attempt deadlock escape
   (force-fail missing outcomes) to node-keyed anchors so a dangling node edge from stale data
   cannot burn `MAX_WEEKS_TO_SEARCH`.
5. **Engine tests** (fixture pattern per the Tests doctrine in CLAUDE.md): cross-goal
   subtask→subtask bound honored (successor's leaf ≥ predecessor leaf's end); goal→subtask and
   subtask→goal variants; completed predecessor transparent (successor unbounded from it,
   bounded by others); unready-root predecessor → one `DEPENDENCY_BROKEN(unready)`; split
   predecessor bounds to its LAST chunk; day caps NOT activated by anchor registration on
   nested goal rows; no watermark starvation with a blocked node successor; idle regen
   re-emits identical events.

### 3c — UI

1. **Item detail** ([SideCards](../app/(protected)/items/[id]/_components/SideCards/SideCards.tsx)):
   relax `canHaveDependencies` to any triaged non-plan item whose root is triaged; the card
   renders on subtasks (the route already resolves subtask ids). New picker modal: search all
   eligible nodes, each option showing its hierarchy as breadcrumbs (Goal › Sub › Item);
   prohibited options ghosted/red with reason — same-goal ("same goal — order is set by the
   list") and loop ("would create a loop"). PERF: do not run the cycle validator per option —
   compute ONE reverse-reachability set from the anchor over the extended graph per picker open
   (single DFS, O(V+E)); an option is prohibited iff it is in the set (or shares the anchor's
   root). Keep the commit-time hard check.
2. **Reorder hook**: subtasks tree drag/reorder and any EditDrawer move runs
   `validateSubtreeOrder` on the proposed array when the subtree carries node-edge endpoints;
   refusal shows describeCycle's path (banner/toast, graph-view refusal language). Same hook in
   the assistant `move_item` op (3d).
3. **Graph view v1** (render-only, no node-edge authoring): fix the silent drop in GraphCanvas
   (`if (!from || !to) continue`) by resolving a node endpoint to its ROOT's pill as the anchor
   fallback; anchor to the actual leaf pill only when leaf view is on and the leaf has a placed
   pill. Suppress `isBroken` error styling for node edges unless per-endpoint spans are
   derivable. Defer: leaf docking for unscheduled node endpoints, graph-side node authoring.
4. **Readiness** ([readinessBlockers.ts](../utils/precedence/readinessBlockers.ts) +
   ItemDetailLayout): resolve a predecessor's readiness/completion through its CONTAINING ROOT
   (a task-typed subtask under an unready goal must block — today the row-level plannerType
   check skips it and the engine later breaks the promise with DEPENDENCY_BROKEN). Blockers that
   are interior nodes render "part of <root title>" and never offer the Ready shortcut
   (readiness cascades from roots only). Extend the save-time clamp in
   `applyDraftForestToPlanner` (currently `if (root.parentId != null) continue`) to clamp a
   root's readiness when any node-level edge into its subtree has a predecessor under an
   unready goal root.

### 3d — draft domain (data safety; MANDATORY same release as 3c)

The assistant does not AUTHOR node edges in v1, but its layers currently destroy them:

1. **Working-copy prune** ([draftPrecedence.ts](../utils/draft/draftPrecedence.ts)): relax the
   dependency-endpoint check to the node predicate over the working forest (any node id in any
   tree, root triaged). Without this, opening the assistant strips user-authored node edges from
   the working copy, flips the dirty flag, and ANY Save deletes them.
2. **Save-time apply** ([applyDraftPrecedence.ts](../utils/draft/applyDraftPrecedence.ts)):
   relax `validEndpointIds` identically, and extend id remapping — `rootIdMap` covers only new
   top-level draft ids; [applyDraftForestToPlanner.ts](../utils/draft/applyDraftForestToPlanner.ts)
   re-mints CHILD ids on delete+recreate paths without reporting them. Report a full
   nodeIdMap (draft id → permanent id, all levels) and translate node-edge endpoints through
   it; an unmapped draft id drops the edge (never persists a dangling reference).
3. **move_item op** ([draftForestOps.ts](../utils/draft/draftForestOps.ts)): run
   `validateSubtreeOrder` against the post-move working forest + canonical node edges; refuse
   with the closing path in the tool_result.
4. **propose_goals restructures**: a wholesale tree re-emit can reorder leaves and close a loop
   through existing node edges. Final defense in the save path: whole-graph revalidation of the
   merged result; on a cycle, drop the involved NODE-LEVEL DEPENDENCY EDGES (never planner
   rows), consistent with the existing "drop assistant-introduced artifacts, never user rows"
   doctrine — here the restructure is the assistant artifact. Rare; surface via the save-time
   notice pattern.
5. **Op-time messages**: `add_dependencies` stays root-only in v1 — update its refusal string to
   say node-level edges exist but are UI-authored for now.

### Out of scope (F1 v1)

Assistant authoring of node edges; graph-canvas authoring of node edges; queue node membership;
node-level urgency (subtask's own deadline driving the lift); leaf docking for unscheduled node
endpoints; aggregated "subtree dependencies" view on root item detail; promote/demote via the
assistant.

Scope: ~25–40 files across utils/precedence, engine scheduler, redux thunk, draft domain, UI;
zero schema/sync changes (the DB has no root constraint — which also means the application
layer is the ONLY enforcement; every predicate change must be exactly consistent).

---

## Hazards the implementer must not rediscover the hard way

1. **The five-layer predicate flip** (3a.6 + 3b.1 + 3d.1 + 3d.2 + the UI pickers) must land
   together. Relax the UI but not the thunk prune → edges vanish on next regen. Relax the thunk
   but not the draft prune → any assistant Save deletes them.
2. **categoryId resolution is own-value-first** (`buildPlannerCategoryMap`): demote must clear
   it; promote must stamp it. Getting either wrong is silent mis-scheduling, not a crash.
3. **Day-cap activation trap** (3b.2): interior nodes registered as tracked roots activate
   stale `maxMinutesPerDay` on nested goal rows. Split anchor registration from completion/cap
   tracking.
4. **Absent-predecessor deadlock** (3b.3): completed/memoized/unready-rooted predecessors are
   not in the leaf pool; unseeded, they block forever and the existing escape hatch only covers
   root gate edges. Seed ends before the loop.
5. **Never null `duration`** on any non-goal row — hard validation error, blanks the whole
   calendar. Zero is a warning; null is fatal.
6. **Promote/demote never go through the AI draft contract** — a root id matching a nested
   canonical row is deliberately treated as a NEW goal with re-minted UUIDs, orphaning every
   precedence reference. Native Redux mutations only.
7. **Dirty-assistant-modal concurrency** (documented, deferred): a native promote during a
   dirty assistant session gets the new root DELETED at Save; a native demote gets it
   DUPLICATED. Pre-existing hazard class; one future mitigation covers both (reseed or block
   Save when canonical root ids change mid-session).
8. **Demote-then-promote does not round-trip** precedence: dependency rows are immutable
   create/delete. The F3 confirm copy must say so.
9. **Engine message identity**: include the node id in `DEPENDENCY_BROKEN` ids for node edges —
   otherwise a node break and a root break on the same pair coalesce and dismissal state leaks
   across them.
10. **Repo conventions apply** (CLAUDE.md): pnpm, no narration comments, no "cat"
    abbreviation, folder-per-component with co-located `*.css.ts`, absolute `@/` imports,
    fixture-pattern engine tests, `pnpm type-check` covers the test project too.

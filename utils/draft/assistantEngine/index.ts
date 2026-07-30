"use client";

import Anthropic from "@anthropic-ai/sdk";
import { parse as parsePartial, Allow } from "partial-json";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import {
  addDraftItems,
  deleteDraftItems,
  moveDraftItem,
  searchDraftItems,
  updateDraftItems,
  type DraftItemUpdate,
  type DraftOpsResult,
} from "@/utils/draft/draftForestOps";
import { assignDraftIds } from "@/utils/draft/assignDraftIds";
import { normalizeDraftForest } from "@/utils/draft/normalizeDraftForest";
import { mergeDraftForest } from "@/utils/draft/mergeDraftForest";
import {
  normalizeDraftTemplates,
  type DraftTemplate,
} from "@/utils/draft/draftTemplates";
import {
  addDraftTemplates,
  deleteDraftTemplates,
  updateDraftTemplates,
  type DraftTemplateOpsResult,
  type DraftTemplateUpdate,
} from "@/utils/draft/draftTemplateOps";
import {
  findWindowOverlaps,
  normalizeDraftWindowsState,
  type DraftWindowsState,
  type DraftTimeWindow,
} from "@/utils/draft/draftWindows";
import {
  addDraftCategories,
  addDraftTimeWindows,
  deleteDraftCategories,
  deleteDraftTimeWindows,
  updateDraftCategories,
  updateDraftTimeWindows,
  type DraftCategoryUpdate,
  type DraftTimeWindowUpdate,
  type DraftWindowOpsResult,
} from "@/utils/draft/draftWindowOps";
import {
  normalizeDraftPrecedenceState,
  pruneDraftPrecedence,
  type DraftPrecedenceState,
} from "@/utils/draft/draftPrecedence";
import {
  addDraftDependencies,
  addDraftQueueMembers,
  addDraftQueues,
  deleteDraftQueues,
  moveDraftQueueMember,
  removeDraftDependencies,
  removeDraftQueueMembers,
  updateDraftQueues,
  type DraftPrecedenceOpsResult,
  type DraftQueueUpdate,
} from "@/utils/draft/draftPrecedenceOps";
import {
  draftHabitsStateEqual,
  normalizeDraftHabitsState,
  pruneDraftHabits,
  type DraftHabitsState,
} from "@/utils/draft/draftHabits";
import {
  addDraftHabitBuckets,
  addDraftHabitItems,
  addDraftHabits,
  deleteDraftHabitBuckets,
  deleteDraftHabits,
  removeDraftHabitItems,
  updateDraftHabitBuckets,
  updateDraftHabits,
  type DraftHabitBucketUpdate,
  type DraftHabitOpsResult,
  type DraftHabitUpdate,
} from "@/utils/draft/draftHabitOps";
import { createBrowserAnthropicClient } from "./anthropicClient";

// The assistant's tool-use loop, running IN THE BROWSER on the user's own
// Anthropic API key (BYOK — the key comes from the device vault in lib/aiKey
// and never touches our server). This used to be app/api/draft/stream: the
// client already held the full working state and uploaded it per request, so
// the loop moved here wholesale — same prompt, same tools, same deterministic
// ops, with the SSE events replaced by direct callbacks.
//
// Architecture: the model does NOT receive the full forest. The system prompt
// carries a one-line-per-goal index; the model pulls complete trees on demand
// via the get_goal_trees tool, answered from the working copy (all local —
// the index + fetched trees are all that ever reaches Anthropic). This runs
// as a tool-use loop: stream -> execute tool calls -> feed tool_results back
// -> stream again, until the model ends its turn.
//
// The baseURL parameter is the future managed-mode seam: a thin authenticated
// proxy route that injects the app's key server-side runs this same loop
// unchanged.

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16000;

// Prompt-hygiene cap: persistent conversations can outgrow what a single
// request should carry, so only the trailing window is sent.
const MAX_HISTORY_MESSAGES = 40;

// Loop guards. Twelve turns fits the headline flow (search + fetch + template
// batches + window edits + propose_goals + follow-ups) without inviting
// runaways.
const MAX_TOOL_TURNS = 12;
const MAX_TREES_PER_FETCH = 25;
const MAX_SEARCH_RESULTS = 25;
const MAX_OP_ITEMS = 50;

export interface StreamChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamDraftFocus {
  rootId: string | null;
  itemId: string | null;
}

export interface StreamDraftCategory {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  locationId: string | null;
  isStrict: boolean;
  useTimeWindows: boolean;
  confineToOwnWindows: boolean;
  timeSlots: { id: string; day: number; startTime: string; endTime: string }[];
}

interface DraftLocationRef {
  id: string;
  name: string;
}

export interface StreamDraftArgs {
  currentForest: DraftForest;
  currentTemplates: DraftTemplate[];
  currentPrecedence: DraftPrecedenceState;
  currentHabits: DraftHabitsState;
  // Canonical plan roots whose recurrence parses — habit items must repeat,
  // and plan recurrence lives outside the forest contract, so eligibility for
  // plans is checked against this set (static per turn: the assistant can't
  // edit plan recurrence).
  recurringPlanIds: string[];
  history: StreamChatMessage[];
  focus: StreamDraftFocus | null;
  categories: StreamDraftCategory[];
  locations: DraftLocationRef[];
  today: string;
  // Programmatic session hint (e.g. "onboarding") — keys a prompt preamble.
  // Prompt-only; never alters tool/apply semantics.
  intent?: string | null;
  signal?: AbortSignal;
  onText: (delta: string) => void;
  // Raw (possibly partial) propose_goals input plus its callIndex; the caller
  // normalizes and folds it against the turn-start working forest. `complete`
  // marks finalized emits (stamped propose_goals re-emit or fromOps trees) —
  // anything else may be a truncated partial if the stream aborts.
  onForest: (payload: {
    callIndex: number;
    proposal: unknown;
    complete: boolean;
  }) => void;
  // Template ops emit the full authoritative array — the caller replaces its
  // working templates wholesale (last write wins, no folding).
  onTemplates: (templates: DraftTemplate[]) => void;
  // Window/flag ops emit the full authoritative state — same contract.
  onWindows: (state: DraftWindowsState) => void;
  // Queue/dependency ops emit the full authoritative state — same contract.
  onPrecedence: (state: DraftPrecedenceState) => void;
  // Habit-tracker ops emit the full authoritative state — same contract.
  onHabits: (state: DraftHabitsState) => void;
  // show_goals: display-only request to bring goals into the tree pane.
  onShow: (payload: { goalIds: string[]; all: boolean }) => void;
  // Tool activity (e.g. the model fetching goal trees) — for a progress hint
  // while a tool round trip runs.
  onStatus?: (payload: { tool: string; count: number }) => void;
  onDone: (stopReason: string | null) => void;
  onError: (message: string) => void;
}

export type RunAssistantTurnArgs = StreamDraftArgs & {
  // The user's own Anthropic API key, freshly read from the device vault.
  apiKey: string;
  baseURL?: string;
};

interface DynamicContextInput {
  currentForest: DraftForest;
  currentTemplates: DraftTemplate[];
  currentPrecedence: DraftPrecedenceState;
  currentHabits: DraftHabitsState;
  focus: StreamDraftFocus | null;
  categories: StreamDraftCategory[];
  locations: DraftLocationRef[];
  today: string;
}

function countDescendants(node: DraftNode): number {
  return node.children.reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}

// One line per top-level goal — the model's cheap map of the forest. Full
// trees are only spent on Anthropic tokens when explicitly fetched.
function buildGoalIndex(
  forest: DraftForest,
  categories: StreamDraftCategory[],
): string {
  if (forest.goals.length === 0) return "(no goals yet)";
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return forest.goals
    .map((goal) => {
      const parts = [
        goal.id || "(new, unsaved)",
        goal.plannerType,
        `"${goal.title}"`,
      ];
      if (goal.categoryId) {
        parts.push(categoryNameById.get(goal.categoryId) ?? goal.categoryId);
      }
      if (goal.deadline) parts.push(`due ${goal.deadline}`);
      if (goal.recurrence) {
        parts.push(
          `repeats ${
            goal.recurrence.interval > 1
              ? `every ${goal.recurrence.interval} ${
                  goal.recurrence.freq === "daily"
                    ? "days"
                    : goal.recurrence.freq === "weekly"
                      ? "weeks"
                      : "months"
                }`
              : goal.recurrence.freq
          }`,
        );
      }
      const n = countDescendants(goal);
      parts.push(n === 0 ? "no subtasks" : `${n} subtask${n === 1 ? "" : "s"}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Nested list: top-level categories are the user's roles, children indented
// beneath their parent so the model can reason about the hierarchy it is
// allowed to edit.
function buildCategoryList(
  categories: StreamDraftCategory[],
  locations: DraftLocationRef[],
): string {
  if (categories.length === 0) return "(the user has no categories yet)";
  const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
  const ids = new Set(categories.map((c) => c.id));
  const byParent = new Map<string | null, StreamDraftCategory[]>();
  for (const c of categories) {
    const key = c.parentId !== null && ids.has(c.parentId) ? c.parentId : null;
    const list = byParent.get(key);
    if (list) list.push(c);
    else byParent.set(key, [c]);
  }
  const lines: string[] = [];
  const emit = (category: StreamDraftCategory, depth: number) => {
    const indent = "  ".repeat(depth);
    const parts = [`${category.id}: ${category.name}`];
    if (category.color) parts.push(category.color);
    if (category.locationId) {
      parts.push(
        `@ ${locationNameById.get(category.locationId) ?? category.locationId}`,
      );
    }
    parts.push(`windows: ${category.useTimeWindows ? "on" : "off"}`);
    parts.push(`strict: ${category.isStrict ? "yes" : "no"}`);
    if (category.confineToOwnWindows) parts.push("own-windows-only");
    lines.push(`${indent}- ${parts.join(" | ")}`);
    for (const w of category.timeSlots) {
      lines.push(
        `${indent}  - window ${w.id} | ${DAY_NAMES[w.day]} ${w.startTime}-${w.endTime}`,
      );
    }
    for (const child of byParent.get(category.id) ?? []) {
      emit(child, depth + 1);
    }
  };
  for (const root of byParent.get(null) ?? []) emit(root, 0);
  return lines.join("\n");
}

function buildTemplateList(
  templates: DraftTemplate[],
  locations: DraftLocationRef[],
): string {
  if (templates.length === 0) return "(no weekly templates yet)";
  const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
  return templates
    .map((t) => {
      const location = t.locationId
        ? locationNameById.get(t.locationId) ?? t.locationId
        : "Anywhere";
      const parts = [
        t.id,
        `${DAY_NAMES[t.startDay]} ${t.startTime} +${t.duration}min`,
        `"${t.title}"`,
        location,
      ];
      if (t.color) parts.push(t.color);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

// Queues and dependencies are small flat structures — like templates, the
// full state rides in the prompt and there is nothing to fetch.
function buildPrecedenceList(
  precedence: DraftPrecedenceState,
  forest: DraftForest,
  categories: StreamDraftCategory[],
): string {
  const titleById = new Map(forest.goals.map((g) => [g.id, g.title]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const lines: string[] = [];

  if (precedence.queues.length === 0) {
    lines.push("(no queues yet)");
  } else {
    for (const queue of precedence.queues) {
      const parts = [`${queue.id}: "${queue.title}"`];
      if (queue.categoryId) {
        parts.push(
          `category ${categoryNameById.get(queue.categoryId) ?? queue.categoryId}`,
        );
      }
      lines.push(`- ${parts.join(" | ")}`);
      if (queue.memberPlannerIds.length === 0) {
        lines.push("  (empty)");
      }
      queue.memberPlannerIds.forEach((id, i) => {
        lines.push(`  ${i + 1}. ${id} "${titleById.get(id) ?? "unknown"}"`);
      });
    }
  }

  lines.push("");
  if (precedence.dependencies.length === 0) {
    lines.push("(no dependencies yet)");
  } else {
    for (const d of precedence.dependencies) {
      lines.push(
        `- "${titleById.get(d.predecessorId) ?? d.predecessorId}" (${d.predecessorId}) must finish before "${titleById.get(d.successorId) ?? d.successorId}" (${d.successorId})`,
      );
    }
  }
  return lines.join("\n");
}

// Habit trackers are a small flat structure — like templates, the full state
// rides in the prompt and there is nothing to fetch. Buckets are the habits
// surface's own grouping (a separate entity from item categories).
function buildHabitsList(
  habits: DraftHabitsState,
  forest: DraftForest,
): string {
  if (habits.buckets.length === 0 && habits.habits.length === 0) {
    return "(no habits or buckets yet)";
  }
  const titleById = new Map(forest.goals.map((g) => [g.id, g.title]));
  const bucketNameById = new Map(habits.buckets.map((b) => [b.id, b.name]));
  const lines: string[] = [];
  if (habits.buckets.length > 0) {
    lines.push("Buckets:");
    for (const bucket of habits.buckets) {
      lines.push(
        `- ${bucket.id}: "${bucket.name}"${bucket.color ? ` | ${bucket.color}` : ""}`,
      );
    }
  } else {
    lines.push("Buckets: (none yet)");
  }
  if (habits.habits.length === 0) {
    lines.push("Habits: (none yet)");
    return lines.join("\n");
  }
  lines.push("Habits:");
  for (const habit of habits.habits) {
    const parts = [`${habit.id}: "${habit.name}"`];
    if (habit.bucketId) {
      parts.push(
        `bucket "${bucketNameById.get(habit.bucketId) ?? habit.bucketId}"`,
      );
    }
    if (habit.color) parts.push(habit.color);
    const items = habit.itemPlannerIds.map(
      (id) => `${id} "${titleById.get(id) ?? "unknown"}"`,
    );
    parts.push(
      items.length === 0
        ? "tracks nothing yet"
        : `tracks: ${items.join(", ")}`,
    );
    lines.push(`- ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

function buildStaticInstructions(intent: string | null): string {
  const intentBlock =
    intent === "onboarding"
      ? `
ONBOARDING SESSION
The user just finished first-run setup and this is their first contact with the assistant. They may have written down a few raw thoughts in a brain-dump step — those arrive in the GOAL INDEX as untyped top-level tasks with placeholder durations and no deadlines. Nothing has been sorted: the triage is YOUR job, done by interviewing. Turn what's there into a plan that can actually be scheduled.

Work through the items warmly, one or two questions at a time — never a form or a wall of questions. For each thought, figure out what it really is and shape it:
- A single actionable stays a TASK: give it a realistic duration and, if it's time-sensitive, a deadline (update_items). A task is ready to schedule by default — it lands on the calendar as soon as it has a real duration. Only hold one back (mark it not ready) if it's a someday/maybe the user isn't acting on yet.
- Something bigger becomes a GOAL: break it into subtasks (add_items or propose_goals) and set a deadline where one exists. Once it has both, mark it ready to schedule by default (via update_items) so the user doesn't have to — no need to ask permission for the obvious case. If it's still missing subtasks or a deadline, leave it unready and say, in plain words, what it needs first.
- A fixed-time commitment ("dentist Tuesday 3pm", "football on Thursdays") cannot be pinned to a start time from here (there is no start-time field in your tools). If it recurs weekly, offer to add a weekly template. If it's a one-off, keep it a task with the right deadline and tell the user they can pin the exact time on the item's page later.
- Assign each item to one of the user's roles (their top-level categories — categoryId on the top-level row) where it fits. If something fits none of their roles, offer to create a fitting role (add_categories) rather than forcing it somewhere wrong — but ask before adding to the roles they picked minutes ago.

Don't end the session leaving items short of what they need to schedule — a task with no real duration, a goal with no subtasks, a goal left unready that has everything it needs. If little or nothing was dumped, interview the user about the current season of their life and draft 2-4 goals across their roles. Only propose category time windows if a natural rhythm surfaces (a fixed study block, gym mornings). Keep every message short and encouraging; nothing is committed until they press Save, so invite them to react and adjust.
`
      : "";

  return `You are a planning assistant for Circadium, a personal scheduling app.

The user's planning library is a forest of top-level goals (and loose tasks), each with a tree of subtasks. You help them restructure existing goals, create new goals with fully worked-out contents, and remove goals. You also manage their weekly template blocks — the fixed recurring commitments (sleep, work hours, standing sessions) the scheduler plans around — their categories themselves (the roles and groupings items are filed under: create, rename, recolor, reorganize, relocate, delete), and their category time windows, the weekly hours a category's items are allowed to schedule in.

STYLE
The chat renders markdown — bold, lists, and inline code are fine; avoid headings and tables in casual replies. Keep responses short and conversational; the tree pane shows the details, so don't enumerate what the user can already see there.
Speak in plain, everyday language — never the app's internal field names. The user has no idea what "isReady", "categoryId", "plannerType", "duration", "parentId", or a node id mean, and hearing them is confusing. Never say things like "isReady is false" or "I set categoryId". Say "this goal isn't ready to schedule yet", "I filed it under Work", "I set it to 30 minutes", "I made it a task". Talk about goals, tasks, deadlines, roles, and being ready to schedule — not database fields or ids.

LIVE STATE
Every user message ends with a <current_state> block carrying the user's live planning data as of that message — today's date, the GOAL INDEX (one line per top-level goal), USER CATEGORIES and their time windows, USER LOCATIONS, WEEKLY TEMPLATES, QUEUES AND DEPENDENCIES, HABITS, and the focused goal if one is open. Always read the latest one and ground all deadlines relative to its date; it supersedes any state mentioned earlier in the conversation. The goal index there is a summary — use search_items to find specific items (including subtasks) by name, and get_goal_trees to read a goal's complete tree.

Categories organize the library: top-level categories are the user's ROLES (the hats they wear in life — the user-facing word is "role"); sub-categories group work within a role. Category rules:
- add_categories creates categories: parentId null makes a new role, a parent id nests beneath it. Ids are minted by the app and reported back. Give a new role a hex color from the palette below; sub-categories may inherit (null).
- update_categories edits name, color, parentId (reorganize; null promotes to a role), locationId (where this work usually happens — items inherit it), and the scheduling flags. Moving a category under itself or a descendant is rejected.
- delete_categories removes a category AND its whole subtree and their windows. Items filed under them are NOT deleted — they just become uncategorized. Only delete when the user explicitly asks, and confirm first if anything is filed under it.
- The scheduling flags: useTimeWindows (whether its windows constrain scheduling), isStrict (its windows are reserved exclusively for its own items), confineToOwnWindows (its items schedule ONLY in its own windows instead of also using ancestors'). isStrict and confineToOwnWindows reshape the whole schedule — only change them when the user explicitly asks.
- Do not rename or recolor categories the user didn't ask you to touch, and never invent a taxonomy wholesale without being asked — the hierarchy is the user's own mental model.

Templates are fixed weekly-recurring blocks of occupied time; goals and tasks are schedulable work the engine places into the remaining gaps. Template rules:
- One template = one block on one weekday, recurring every week. "Gym three times a week" = three templates on distinct days.
- startDay is 0-6 with 0 = Sunday. startTime is "HH:MM" 24h; duration is minutes. A block spanning midnight keeps its start day and runs past it: sleep 23:00-07:00 is startTime "23:00", duration 480.
- Overlapping templates are allowed but usually a mistake — flag overlaps in prose.
- color: optional 6-digit hex. Reuse one color for every block of the same activity. Good palette picks: #1976D2 blue, #2E7D32 green, #F77F00 orange, #6C5CE7 violet, #16A085 teal, #E63946 red, #FFB703 amber, #1D3557 navy.
- locationId: one of the user's location ids, or omit for "Anywhere".
- The full current template list rides in the live state block with each message — there is nothing to fetch. Template ids are minted by the app and reported back when you add.

Category time windows bound WHEN a category's goals and tasks may be scheduled (work items only during work hours, etc.). Window rules:
- One window = one day + one range: "HH:MM" 24h. startTime < endTime is within-day; startTime > endTime is overnight and runs into the next morning (e.g. 23:00-07:00). Use "23:59" for a window that ends exactly at midnight.
- Windows must NEVER overlap — not within a category and not across categories (two categories cannot both claim the same hours). Plan the week as non-overlapping blocks. The tool result flags any overlap your change creates; fix it immediately with update_time_windows or delete_time_windows before ending your turn.
- Windows only take effect while the category's windows flag is on. Adding a window to a category with windows off turns the flag on automatically — mention that to the user.
- strict: a strict category reserves its windows exclusively for its own items; other work is pushed out. This reshapes the whole schedule — only change strict when the user explicitly asks.
- The full window list rides in the live state block with each message, under USER CATEGORIES — there is nothing to fetch. Window ids are minted by the app and reported back when you add.
- Windows constrain scheduling; templates occupy time. "I work 9-17" as occupied time is a template; "work tasks should happen 9-17" is a window on the Work category.
- WORD CHOICE decides the tool, not the topic. If the user says "window" or "category window" (even "Work category windows"), use the window tools (add_time_windows / update_time_windows) and NEVER add_templates. If they say "template", "block", or "commitment", use the template tools. When genuinely ambiguous, ask which they mean rather than guessing.

Queues and dependencies sequence the user's work. A queue is an ordered list of top-level items scheduled strictly first-to-last; a dependency says one top-level item must finish before another starts. Rules:
- Only TOP-LEVEL tasks and goals qualify (ids from the goal index; draft ids work too) — never subtasks, never plans. An item can belong to at most ONE queue.
- Member order in a queue is the schedule order. add_queue_members appends (or inserts at atIndex); move_queue_member repositions.
- Dependencies may give one item several prerequisites; it starts after ALL of them finish. Completed prerequisites are simply skipped, so linking to something already done is harmless but pointless — mention it instead of adding it.
- Loops are impossible and the tools refuse them, reporting the chain that would close the loop (e.g. "A" → "B" → "A"). Relay that path in plain words and offer a fix (reorder, or drop one link).
- A dependency that repeats what a queue already enforces is allowed but redundant — prefer one mechanism per relationship.
- A queue's optional category: members without their own category inherit it for scheduling (its time windows and location apply to them). Set it when the queue clearly belongs to one area of the user's life.
- When the user describes sequential work ("first X, then Y", "after the kitchen is done"), use a queue for a named ordered stream of whole items and dependencies for one-off prerequisite links between otherwise independent items.
- Only delete a queue or remove members when the user asks. When the user speaks of these, say "queue" and "depends on" — never "queueId", "member", "plannerId", "predecessor", or "successor".

Habits are trackers, not schedulable items: a habit watches the occurrence completions of the repeating top-level items linked to it and shows the user a month grid of green completion circles plus streaks on the Habits page. Scheduling comes from the items themselves. Habit rules:
- BUCKETS are the habits page's own shelves — a separate thing from the user's categories/roles. Bucket ids and category ids are never interchangeable. add_habit_buckets / update_habit_buckets / delete_habit_buckets manage them (name, optional hex color); deleting a bucket keeps its habits, unsorted. Create a bucket before filing habits into it (its id is reported back).
- add_habits creates trackers (name, optional bucketId, optional hex color, optional initial itemPlannerIds). Ids are minted by the app and reported back.
- update_habits patches name/color/bucketId, or replaces the tracked-item set wholesale via itemPlannerIds; add_habit_items / remove_habit_items adjust the set incrementally.
- Tracked items must be TOP-LEVEL items that REPEAT (a task/goal with a repeat rule, or a recurring plan — ids from the goal index; draft ids work too). One-off items and subtasks are refused: a habit counts occurrences, so there must be occurrences to count. Every occurrence of every linked item counts as one instance in the habit's grid.
- The natural "build a habit" flow: create (or find) a top-level task with a repeat rule sized to the behavior ("meditate 20min, repeats daily"), then a habit tracking it — the item is created with the goal tools, the tracker with the habit tools. A repeating goal works for multi-step routines ("weekly cleaning" with its subtasks). Ask which bucket fits if unclear, or leave the habit unsorted.
- Deleting a habit never deletes the tracked items — only the tracker. Only delete when the user asks.
- When the user speaks of these, say "habit", "tracks", and "bucket" — never "itemPlannerIds", "habitId", or "bucketId".
${intentBlock}
NODE STRUCTURE
Each node in a goal tree has:
- id: existing planner UUID. Echo it verbatim for retained nodes; OMIT the field (or set null) for new nodes.
- title: short human-readable name.
- plannerType: "task" | "plan" | "goal". Leaves are "task"; any node with subtasks is a "goal" — the app enforces this automatically, so you never need to fix a parent's type by hand. Change a leaf's type with update_items (task <-> goal, or plan -> task). Never create new "plan" nodes — plans need a fixed start time this contract doesn't carry.
- duration: minutes required for that leaf task. For a "goal" node, duration is a rough estimate (children sum to the real total).
- deadline: ISO date string or null.
- priority: integer 1-7 (higher = more important); 4 is neutral.
- isReady: top-level goals only — true marks the goal ready for scheduling, and requires at least one subtask AND a deadline or repeat rule (the app blocks it otherwise). Default a goal you create to ready (isReady true) whenever it meets that, so it starts scheduling immediately and the user doesn't have to turn it on by hand. If it falls short, leave it unready and, in plain words, tell the user what it still needs before it can be scheduled. OMIT this field (or use null) on all child nodes; readiness cascades from the root (every row in a subtree carries the root's value, stamped on save).
- categoryId: top-level goals only — one of the user's category ids, or null. Echo it verbatim for retained goals (null on a retained goal means "leave as is"); pick a fitting category for new goals, or null if none fits. Never set it on child nodes; they inherit.
- color: top-level goals only — a 6-digit hex color for the whole goal (its subtasks inherit it on the calendar). Give every NEW goal a fitting color and vary colors across goals so the calendar doesn't come out all one shade. Good palette: #1976D2 blue, #2E7D32 green, #F77F00 orange, #6C5CE7 violet, #16A085 teal, #E63946 red, #FFB703 amber, #1D3557 navy, #8E44AD purple, #D81B60 pink. Echo the existing color verbatim for retained goals (null means "leave as is"). Never set it on child nodes; they inherit.
- splitting: schedulable leaves only (never plans, never nodes with subtasks) — {minMinutes, maxMinutes, maxMinutesPerDay, minSpacingMinutes} or null. Non-null makes the scheduler place the item as flexibly sized chunks (each between min and max, at most maxMinutesPerDay per day when set; maxMinutesPerDay null = no daily limit) instead of one continuous block — right for long, interruptible work like "read the textbook, 12h". minSpacingMinutes (optional; null = no forced gap) keeps at least that many minutes of break between consecutive chunks of the item. minMinutes >= 5 and maxMinutes >= minMinutes, or maxMinutes 0 meaning no upper bound (chunks grow to fill the free time they land in). Echo it verbatim for retained nodes in propose_goals — a re-emitted tree that drops it turns chunking off. When the user speaks of it, call it splitting into chunks — never say "splitting field".
- maxMinutesPerDay: top-level goals only — the goal's daily limit: at most this many minutes of the goal's whole subtree are scheduled on any one day (an integer, or null for no limit). Use it when the user wants a big goal spread out ("no more than 2 hours of this per day"). Echo it verbatim for retained goals in propose_goals — a re-emitted tree that drops it removes the limit. Never set it on child nodes. When the user speaks of it, call it the daily limit — never say "maxMinutesPerDay".
- recurrence: top-level tasks and goals only — {freq "daily"|"weekly"|"monthly", interval, until} or null. Non-null makes the item REPEAT flexibly: the scheduler places one occurrence per period wherever it fits (the whole subtask sequence each period for a goal) instead of scheduling it once. This is how habits-like behavior is built ("meditate 20min daily", "clean weekly"). A repeating item has NO deadline — the rule replaces it (each occurrence is bounded by its own period), and setting one clears any deadline automatically. Echo it verbatim for retained items in propose_goals — a re-emitted tree that drops it stops the repetition. Never set it on child nodes (they repeat with their goal) and never on plans (a plan repeats on its fixed schedule, managed in the app). When the user speaks of it, say "repeats weekly" — never "recurrence field".
- children: ordered array of sub-nodes. Empty for leaves.

ID PRESERVATION (IMPORTANT)
- KEEP an existing node: include its id EXACTLY as given.
- CREATE a new node: omit the id field or set it to null. The app assigns it a draft id (reported in tool results and visible in fetched trees); unsaved drafts then behave exactly like saved goals — they appear in the index and work with every tool, including fetch-before-modify.
- Draft ids are replaced with permanent ids when the user saves, so never reuse an id remembered from an earlier conversation — verify against the current index or search first.
- REMOVE a node inside a goal you're editing: simply don't include it in that goal's tree.
- Never invent, modify, or reuse an id from a different node, and never move a node between two different top-level goals — that changes its identity.

TOOLS

Reading:
- search_items: find items (including subtasks) by title; returns ids and which goal they live in. Use it to locate anything whose id you don't have.
- get_goal_trees: fetch complete trees by id. Required before propose_goals may modify a goal (proposals are complete-tree replacements; editing blind would silently delete subtasks). The focused goal (if any) is already provided. Tool results are NOT retained between user messages — re-fetch each message.

Editing — deterministic operations. PREFER these for small changes; each applies immediately to the user's review pane as a pending change (nothing is saved without their confirmation):
- update_items: change fields (title, plannerType task/goal, duration, deadline, priority, isReady; categoryId on top-level goals only; splitting on schedulable leaves — an object turns chunked scheduling on or adjusts it, null turns it off; maxMinutesPerDay on top-level goals only — the daily limit, null removes it; recurrence on top-level tasks/goals only — an object makes the item repeat flexibly and clears its deadline, null stops the repetition) on items by id. No fetch needed. Use this to convert an item's type — you no longer need propose_goals just to change a task into a goal or a plan into a task. Readiness (isReady) gates scheduling for every item: tasks and plans are ready by default and you can mark one not ready to keep it off the calendar; a goal can only be readied once it has subtasks and a deadline or repeat rule.
- move_item: move or reorder an item within its own goal (new parent + position). Cross-goal moves and moving top-level goals are not supported.
- add_items: insert new subtasks under an existing parent. Added items are assigned draft ids on insertion — fetch the goal tree if you need to reference them.
- delete_items: remove items (with their subtrees) or whole goals by id.
- add_templates / update_templates / delete_templates: manage the user's weekly template blocks. Batch related blocks into one call (e.g. all three gym sessions). Updates are partial patches by id; null clears color or locationId.
- add_time_windows / update_time_windows / delete_time_windows: manage category time windows by id. Batch related windows into one call (e.g. all five weekday windows).
- add_categories / update_categories / delete_categories: manage the categories themselves — create roles and sub-categories, rename, recolor, reorganize (parentId), set a location, toggle scheduling flags, delete (subtree + windows; only on explicit request). To create a parent and its children, create the parent first and use its reported id in the next call.
- add_queues / update_queues / delete_queues: manage queues (ordered work streams). add_queues may include initial members in order; ids are minted by the app and reported back.
- add_queue_members / move_queue_member / remove_queue_members: manage a queue's members by top-level item id. Adds append unless atIndex is given; moves address the position after the item is lifted out.
- add_dependencies / remove_dependencies: prerequisite links between top-level items ({predecessorId, successorId} — the first must finish before the second starts).
- add_habit_buckets / update_habit_buckets / delete_habit_buckets: manage the habit page's buckets (its own grouping — not categories). add_habits / update_habits / delete_habits: manage habit trackers (name, bucket, color, tracked-item set); add_habit_items / remove_habit_items adjust one habit's tracked items (repeating top-level items only). Ids are minted by the app and reported back.

Building:
- propose_goals: create new top-level goals, or restructure a goal wholesale. Complete trees ONLY for goals you create or modify — never re-emit untouched goals, and never use this for small edits (use the editing tools instead). Emit each goal's id as its FIRST field; new nodes omit id (draft ids are assigned and reported back). deletedGoalIds removes whole goals. The order of the goals array is not meaningful.

Display:
- show_goals: bring existing goals into the user's tree pane without changing them. Pass ids, or all: true.

The user's tree pane starts nearly empty: it displays only the focused goal, goals you change, and goals you show. Template changes appear on a separate Week tab that always shows the full weekly schedule; category and window changes appear on a Categories tab grouped by category; queue and dependency changes appear on a Queues tab; habit changes appear on a Habits tab.

Always write at least one short sentence of prose before calling any tool — never reply with a bare tool call. If the user is only asking a question, answer in prose (using the reading tools if needed) and don't make changes.`;
}

// The static instructions are byte-stable across turns and conversations
// (only the intent variant differs), so they are computed once and cached as
// the request's first prefix breakpoint — see withCacheBreakpoints. Onboarding
// sessions get their own cached prefix.
const STATIC_INSTRUCTIONS_DEFAULT = buildStaticInstructions(null);
const STATIC_INSTRUCTIONS_ONBOARDING = buildStaticInstructions("onboarding");

// 5-minute ephemeral cache. Loop iterations are seconds apart and consecutive
// user turns usually land within the window; a 1h TTL is a possible follow-up
// (it doubles the cache-write cost).
const EPHEMERAL_CACHE: Anthropic.CacheControlEphemeral = { type: "ephemeral" };

// The system is a single cached text block. Render order is tools -> system ->
// messages, so this one breakpoint caches the 33 tool schemas AND the static
// instructions together (~12-13k tokens, well above the cacheable minimum).
const SYSTEM_BLOCKS_DEFAULT: Anthropic.TextBlockParam[] = [
  { type: "text", text: STATIC_INSTRUCTIONS_DEFAULT, cache_control: EPHEMERAL_CACHE },
];
const SYSTEM_BLOCKS_ONBOARDING: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: STATIC_INSTRUCTIONS_ONBOARDING,
    cache_control: EPHEMERAL_CACHE,
  },
];

// The data-shaped half of the prompt: everything that changes turn to turn.
// Delivered trailing the final user message (not in the system prompt) so a
// state change never invalidates the cached system + history prefix. The
// focused goal is serialized compact — the pretty-printed form meaningfully
// inflates large trees.
function buildDynamicContext({
  currentForest,
  currentTemplates,
  currentPrecedence,
  currentHabits,
  focus,
  categories,
  locations,
  today,
}: DynamicContextInput): string {
  const categoryList = buildCategoryList(categories, locations);

  const locationList =
    locations.length > 0
      ? locations.map((l) => `- ${l.id}: ${l.name}`).join("\n")
      : "(the user has no locations yet)";

  const focusedGoal = focus?.rootId
    ? currentForest.goals.find((g) => g.id === focus.rootId)
    : undefined;
  const focusBlock = focusedGoal
    ? `
FOCUSED GOAL
The user currently has this goal open${
        focus?.itemId && focus.itemId !== focus.rootId
          ? ` (specifically the node with id ${focus.itemId})`
          : ""
      }. Its complete tree (already fetched for you — no need to call get_goal_trees for it):
${JSON.stringify(focusedGoal)}

Scope your work to this goal unless the user asks for something broader.
`
    : "";

  return `Today's date is ${today}. Ground all deadlines relative to it.

GOAL INDEX (id | type | title | category | deadline | size)
${buildGoalIndex(currentForest, categories)}

USER CATEGORIES (nesting = hierarchy; each line: id: name | color | @location | flags; "window" lines are that category's time windows)
${categoryList}

USER LOCATIONS (id: name) — read-only; you cannot create locations, only reference these ids
${locationList}

WEEKLY TEMPLATES (id | day start +duration | title | location | color)
${buildTemplateList(currentTemplates, locations)}

QUEUES AND DEPENDENCIES (queues with their members in schedule order; after the blank line, the prerequisite edges)
${buildPrecedenceList(currentPrecedence, currentForest, categories)}

HABITS (buckets first, then each habit: id: "name" | bucket | color | tracked items)
${buildHabitsList(currentHabits, currentForest)}
${focusBlock}`;
}

const getGoalTreesTool: Anthropic.Tool = {
  name: "get_goal_trees",
  description:
    "Fetch the complete trees of top-level goals by id (from the goal index). Required before modifying a goal. Results are not retained between user messages.",
  input_schema: {
    type: "object",
    properties: {
      goalIds: {
        type: "array",
        items: { type: "string" },
        description: `Ids of top-level goals to fetch (max ${MAX_TREES_PER_FETCH} per call).`,
      },
    },
    required: ["goalIds"],
  } as Anthropic.Tool["input_schema"],
};

const proposeGoalsTool: Anthropic.Tool = {
  name: "propose_goals",
  description:
    "Propose changes to the user's goal forest. Emits complete trees only for the top-level goals being created or modified, plus the ids of goals to delete. Untouched goals must not be re-emitted. Preserve existing planner UUIDs for retained nodes; omit id for new nodes. You must have fetched (or been given) the current tree of any goal you modify.",
  input_schema: {
    type: "object",
    $defs: {
      draftNode: {
        type: "object",
        properties: {
          id: {
            type: ["string", "null"],
            description:
              "Existing planner UUID for retained nodes; omit or null for new nodes. Emit this as the first field.",
          },
          title: { type: "string" },
          plannerType: {
            type: "string",
            enum: ["task", "plan", "goal"],
          },
          duration: {
            type: "integer",
            description: "Duration in minutes.",
          },
          deadline: { type: ["string", "null"] },
          priority: { type: "integer", minimum: 1, maximum: 7 },
          isReady: { type: ["boolean", "null"] },
          categoryId: {
            type: ["string", "null"],
            description:
              "Top-level goals only: one of the user's category ids, or null. Never set on child nodes.",
          },
          color: {
            type: ["string", "null"],
            description:
              'Top-level goals only: a 6-digit hex color (e.g. "#1976D2") for the whole goal; its subtasks inherit it. Never set on child nodes.',
          },
          splitting: {
            type: ["object", "null"],
            description:
              "Schedulable leaves only: chunked-scheduling settings. Echo verbatim for retained nodes — dropping it turns chunking off. minSpacingMinutes is an optional minimum break between chunks.",
            properties: {
              minMinutes: { type: "integer" },
              maxMinutes: { type: "integer" },
              maxMinutesPerDay: { type: ["integer", "null"] },
              minSpacingMinutes: { type: ["integer", "null"] },
            },
            required: ["minMinutes", "maxMinutes"],
          },
          maxMinutesPerDay: {
            type: ["integer", "null"],
            description:
              "Top-level goals only: the goal's daily limit — max minutes of its subtree scheduled on any one day. Echo verbatim for retained goals; dropping it removes the limit. Never set on child nodes.",
          },
          recurrence: {
            type: ["object", "null"],
            description:
              "Top-level tasks/goals only: flexible repeat rule — the scheduler places one occurrence per period (a repeating item has no deadline). Echo verbatim for retained items; dropping it stops the repetition. Never set on child nodes or plans.",
            properties: {
              freq: {
                type: "string",
                enum: ["daily", "weekly", "monthly"],
              },
              interval: { type: "integer", minimum: 1 },
              until: { type: ["string", "null"] },
            },
            required: ["freq"],
          },
          children: {
            type: "array",
            items: { $ref: "#/$defs/draftNode" },
          },
        },
        required: ["title", "plannerType", "duration", "children"],
      },
    },
    properties: {
      goals: {
        type: "array",
        description:
          "Complete trees for created or modified top-level goals only.",
        items: { $ref: "#/$defs/draftNode" },
      },
      deletedGoalIds: {
        type: "array",
        description: "Ids of top-level goals to remove entirely.",
        items: { type: "string" },
      },
    },
    required: ["goals"],
  } as Anthropic.Tool["input_schema"],
};

const showGoalsTool: Anthropic.Tool = {
  name: "show_goals",
  description:
    "Bring existing top-level goals into the user's tree pane without proposing any changes. Use when the user asks to see goals. Pass all: true to display the whole forest.",
  input_schema: {
    type: "object",
    properties: {
      goalIds: {
        type: "array",
        items: { type: "string" },
        description: "Ids of top-level goals to display.",
      },
      all: {
        type: "boolean",
        description: "Display every goal.",
      },
    },
  } as Anthropic.Tool["input_schema"],
};

const searchItemsTool: Anthropic.Tool = {
  name: "search_items",
  description:
    "Search all items (goals and subtasks at any depth) by title. Returns matching ids, types, and which top-level goal each item lives in. Use this to locate items whose ids you don't have.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Case-insensitive title search.",
      },
    },
    required: ["query"],
  } as Anthropic.Tool["input_schema"],
};

const updateItemsTool: Anthropic.Tool = {
  name: "update_items",
  description:
    'Change fields on existing items by id — title, plannerType ("task" or "goal"; convert a leaf task into an empty goal or vice versa, or turn a plan into a task), duration (minutes), deadline (ISO date or null to clear), priority, isReady, categoryId (top-level goals only; null to clear), splitting (schedulable leaves only — an object enables/adjusts chunked scheduling, null turns it off), and maxMinutesPerDay (top-level goals only — the goal\'s daily limit in minutes, null to remove it). An item with subtasks is always a goal — that is enforced automatically, so you never set plannerType just to fix a parent. Structural changes (adding, moving, removing items) use the other tools.',
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            plannerType: { type: "string", enum: ["task", "goal"] },
            duration: { type: "integer" },
            deadline: { type: ["string", "null"] },
            priority: { type: "integer", minimum: 1, maximum: 7 },
            isReady: { type: ["boolean", "null"] },
            categoryId: { type: ["string", "null"] },
            splitting: {
              type: ["object", "null"],
              properties: {
                minMinutes: { type: "integer" },
                maxMinutes: { type: "integer" },
                maxMinutesPerDay: { type: ["integer", "null"] },
                minSpacingMinutes: { type: ["integer", "null"] },
              },
              required: ["minMinutes", "maxMinutes"],
            },
            maxMinutesPerDay: {
              type: ["integer", "null"],
              description:
                "Top-level goals only: the goal's daily limit in minutes; null removes it.",
            },
            recurrence: {
              type: ["object", "null"],
              description:
                "Top-level tasks/goals only: an object makes the item repeat flexibly (clearing its deadline); null stops the repetition.",
              properties: {
                freq: {
                  type: "string",
                  enum: ["daily", "weekly", "monthly"],
                },
                interval: { type: "integer", minimum: 1 },
                until: { type: ["string", "null"] },
              },
              required: ["freq"],
            },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const moveItemTool: Anthropic.Tool = {
  name: "move_item",
  description:
    "Move or reorder an item within its own top-level goal. The new parent may be the goal itself or any node inside it. Position: afterSiblingId inserts after that child of the new parent; atStart inserts first; neither appends at the end. Top-level goals and cross-goal moves are not supported.",
  input_schema: {
    type: "object",
    properties: {
      itemId: { type: "string" },
      newParentId: { type: "string" },
      afterSiblingId: { type: "string" },
      atStart: { type: "boolean" },
    },
    required: ["itemId", "newParentId"],
  } as Anthropic.Tool["input_schema"],
};

const addItemsTool: Anthropic.Tool = {
  name: "add_items",
  description:
    "Insert new items (with optional nested children) under an existing parent — the goal itself or any node inside it. Items use the node structure WITHOUT ids (real ids are assigned when the user saves). Position works like move_item.",
  input_schema: {
    type: "object",
    properties: {
      parentId: { type: "string" },
      items: {
        type: "array",
        items: { $ref: "#/$defs/newNode" },
      },
      afterSiblingId: { type: "string" },
      atStart: { type: "boolean" },
    },
    $defs: {
      newNode: {
        type: "object",
        properties: {
          title: { type: "string" },
          plannerType: { type: "string", enum: ["task", "goal"] },
          duration: { type: "integer" },
          deadline: { type: ["string", "null"] },
          priority: { type: "integer", minimum: 1, maximum: 7 },
          isReady: { type: ["boolean", "null"] },
          splitting: {
            type: ["object", "null"],
            properties: {
              minMinutes: { type: "integer" },
              maxMinutes: { type: "integer" },
              maxMinutesPerDay: { type: ["integer", "null"] },
              minSpacingMinutes: { type: ["integer", "null"] },
            },
            required: ["minMinutes", "maxMinutes"],
          },
          children: {
            type: "array",
            items: { $ref: "#/$defs/newNode" },
          },
        },
        required: ["title", "plannerType", "duration", "children"],
      },
    },
    required: ["parentId", "items"],
  } as Anthropic.Tool["input_schema"],
};

const deleteItemsTool: Anthropic.Tool = {
  name: "delete_items",
  description:
    "Delete items by id, including their whole subtrees. A top-level goal id deletes the entire goal.",
  input_schema: {
    type: "object",
    properties: {
      itemIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["itemIds"],
  } as Anthropic.Tool["input_schema"],
};

const addTemplatesTool: Anthropic.Tool = {
  name: "add_templates",
  description:
    "Create weekly template blocks (fixed recurring commitments like sleep, work hours, gym sessions). One entry per weekday occurrence. Ids are minted by the app and reported back. Batch related blocks into one call.",
  input_schema: {
    type: "object",
    properties: {
      templates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            startDay: {
              type: "integer",
              description: "0-6, 0 = Sunday.",
            },
            startTime: {
              type: "string",
              description: '"HH:MM", 24-hour.',
            },
            duration: {
              type: "integer",
              description:
                "Minutes. Blocks spanning midnight keep their start day.",
            },
            color: {
              type: ["string", "null"],
              description:
                "Optional 6-digit hex; reuse one color per activity.",
            },
            locationId: {
              type: ["string", "null"],
              description: "One of the user's location ids, or null for Anywhere.",
            },
          },
          required: ["title", "startDay", "startTime", "duration"],
        },
      },
    },
    required: ["templates"],
  } as Anthropic.Tool["input_schema"],
};

const updateTemplatesTool: Anthropic.Tool = {
  name: "update_templates",
  description:
    "Change fields on existing weekly templates by id — title, startDay (0-6, 0 = Sunday), startTime (HH:MM), duration (minutes), color (null clears), locationId (null = Anywhere). Partial patches; omit fields you are not changing.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            startDay: { type: "integer" },
            startTime: { type: "string" },
            duration: { type: "integer" },
            color: { type: ["string", "null"] },
            locationId: { type: ["string", "null"] },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const deleteTemplatesTool: Anthropic.Tool = {
  name: "delete_templates",
  description: "Delete weekly template blocks by id.",
  input_schema: {
    type: "object",
    properties: {
      templateIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["templateIds"],
  } as Anthropic.Tool["input_schema"],
};

const addTimeWindowsTool: Anthropic.Tool = {
  name: "add_time_windows",
  description:
    "Create category time windows (the weekly hours a category's items may schedule in). One entry per day occurrence; startTime < endTime is within-day, startTime > endTime is an overnight window running into the next morning (e.g. 23:00-07:00). Ids are minted by the app and reported back. Adding to a category with windows off enables the flag automatically.",
  input_schema: {
    type: "object",
    properties: {
      windows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            categoryId: { type: "string" },
            day: {
              type: "integer",
              description: "0-6, 0 = Sunday.",
            },
            startTime: {
              type: "string",
              description: '"HH:MM", 24-hour.',
            },
            endTime: {
              type: "string",
              description:
                '"HH:MM", 24-hour. Before startTime makes an overnight window that runs to the next morning; "23:59" for end of day.',
            },
          },
          required: ["categoryId", "day", "startTime", "endTime"],
        },
      },
    },
    required: ["windows"],
  } as Anthropic.Tool["input_schema"],
};

const updateTimeWindowsTool: Anthropic.Tool = {
  name: "update_time_windows",
  description:
    "Change existing category time windows by id — day (0-6, 0 = Sunday), startTime/endTime (HH:MM; startTime > endTime = overnight), or categoryId to move a window to another category. Partial patches; omit fields you are not changing.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            categoryId: { type: "string" },
            day: { type: "integer" },
            startTime: { type: "string" },
            endTime: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const deleteTimeWindowsTool: Anthropic.Tool = {
  name: "delete_time_windows",
  description: "Delete category time windows by id.",
  input_schema: {
    type: "object",
    properties: {
      windowIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["windowIds"],
  } as Anthropic.Tool["input_schema"],
};

const addCategoriesTool: Anthropic.Tool = {
  name: "add_categories",
  description:
    "Create categories. parentId null (or omitted) creates a top-level category — a ROLE in the user's vocabulary; a parent id nests a sub-category beneath it and must be an id you already have. Ids are minted by the app and reported back, so to create a parent and its children, create the parent first and use its reported id in a follow-up call. New categories start with windows off and strict off.",
  input_schema: {
    type: "object",
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            color: {
              type: ["string", "null"],
              description:
                '6-digit hex like "#1976D2"; null inherits/derives at render.',
            },
            parentId: {
              type: ["string", "null"],
              description:
                "Existing category id to nest under; null for a top-level role.",
            },
            locationId: {
              type: ["string", "null"],
              description:
                "One of the user's location ids — where this category's work usually happens (items inherit it).",
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["categories"],
  } as Anthropic.Tool["input_schema"],
};

const updateCategoriesTool: Anthropic.Tool = {
  name: "update_categories",
  description:
    "Edit categories by id: name, color (6-digit hex or null), parentId (reorganize the hierarchy; null promotes to a top-level role; moving under itself or a descendant is rejected), locationId (or null), and the scheduling flags useTimeWindows, isStrict, and confineToOwnWindows. Partial patches — omit fields you are not changing. Only change isStrict or confineToOwnWindows when the user explicitly asks.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            color: { type: ["string", "null"] },
            parentId: { type: ["string", "null"] },
            locationId: { type: ["string", "null"] },
            useTimeWindows: { type: "boolean" },
            isStrict: { type: "boolean" },
            confineToOwnWindows: { type: "boolean" },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const deleteCategoriesTool: Anthropic.Tool = {
  name: "delete_categories",
  description:
    "Delete categories by id, together with their whole subtree of sub-categories and all their time windows. Items filed under them are NOT deleted — they become uncategorized. Only use on an explicit user request, and confirm first when anything is filed under the category.",
  input_schema: {
    type: "object",
    properties: {
      categoryIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["categoryIds"],
  } as Anthropic.Tool["input_schema"],
};

const addQueuesTool: Anthropic.Tool = {
  name: "add_queues",
  description:
    "Create queues — named ordered work streams over top-level items. memberPlannerIds (optional) seeds the queue in schedule order; each member must be a top-level task or goal not already in a queue. Queue ids are minted by the app and reported back.",
  input_schema: {
    type: "object",
    properties: {
      queues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            categoryId: {
              type: ["string", "null"],
              description:
                "Optional inherited default: members without their own category adopt this one for scheduling.",
            },
            memberPlannerIds: {
              type: "array",
              items: { type: "string" },
              description:
                "Top-level item ids in schedule order (first schedules first).",
            },
          },
          required: ["title"],
        },
      },
    },
    required: ["queues"],
  } as Anthropic.Tool["input_schema"],
};

const updateQueuesTool: Anthropic.Tool = {
  name: "update_queues",
  description:
    "Edit queues by id: title, categoryId (null clears the inherited default). Partial patches — omit fields you are not changing. Membership is managed with the member tools, not here.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            categoryId: { type: ["string", "null"] },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const deleteQueuesTool: Anthropic.Tool = {
  name: "delete_queues",
  description:
    "Delete queues by id. The member items themselves are untouched — only the ordering is removed. Only use on an explicit user request.",
  input_schema: {
    type: "object",
    properties: {
      queueIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["queueIds"],
  } as Anthropic.Tool["input_schema"],
};

const addQueueMembersTool: Anthropic.Tool = {
  name: "add_queue_members",
  description:
    "Add top-level items to a queue, in the given order. Appends at the end unless atIndex is given (0 = first). Each item must be a top-level task or goal and not already in any queue; an addition that would create a loop is refused with the closing path.",
  input_schema: {
    type: "object",
    properties: {
      queueId: { type: "string" },
      plannerIds: {
        type: "array",
        items: { type: "string" },
      },
      atIndex: {
        type: "integer",
        description: "Insertion position, 0 = first. Omit to append.",
      },
    },
    required: ["queueId", "plannerIds"],
  } as Anthropic.Tool["input_schema"],
};

const moveQueueMemberTool: Anthropic.Tool = {
  name: "move_queue_member",
  description:
    "Move a member to a new position within its queue. toIndex addresses the order AFTER the member is lifted out (0 = first). A reorder that would create a loop is refused with the closing path.",
  input_schema: {
    type: "object",
    properties: {
      queueId: { type: "string" },
      plannerId: { type: "string" },
      toIndex: { type: "integer" },
    },
    required: ["queueId", "plannerId", "toIndex"],
  } as Anthropic.Tool["input_schema"],
};

const removeQueueMembersTool: Anthropic.Tool = {
  name: "remove_queue_members",
  description:
    "Remove items from their queues by top-level item id (an item is in at most one queue). The items themselves are untouched.",
  input_schema: {
    type: "object",
    properties: {
      plannerIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["plannerIds"],
  } as Anthropic.Tool["input_schema"],
};

const addDependenciesTool: Anthropic.Tool = {
  name: "add_dependencies",
  description:
    "Create prerequisite links between top-level items: the predecessor must finish before the successor starts. An item may have several prerequisites (it starts after ALL finish). A link that would create a loop is refused with the closing path.",
  input_schema: {
    type: "object",
    properties: {
      dependencies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            predecessorId: { type: "string" },
            successorId: { type: "string" },
          },
          required: ["predecessorId", "successorId"],
        },
      },
    },
    required: ["dependencies"],
  } as Anthropic.Tool["input_schema"],
};

const removeDependenciesTool: Anthropic.Tool = {
  name: "remove_dependencies",
  description:
    "Remove prerequisite links by their {predecessorId, successorId} pair.",
  input_schema: {
    type: "object",
    properties: {
      dependencies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            predecessorId: { type: "string" },
            successorId: { type: "string" },
          },
          required: ["predecessorId", "successorId"],
        },
      },
    },
    required: ["dependencies"],
  } as Anthropic.Tool["input_schema"],
};

const addHabitBucketsTool: Anthropic.Tool = {
  name: "add_habit_buckets",
  description:
    "Create habit buckets — the Habits page's own grouping shelves, separate from the user's categories. Ids are minted by the app and reported back.",
  input_schema: {
    type: "object",
    properties: {
      buckets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            color: {
              type: ["string", "null"],
              description: "Optional 6-digit hex color.",
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["buckets"],
  } as Anthropic.Tool["input_schema"],
};

const updateHabitBucketsTool: Anthropic.Tool = {
  name: "update_habit_buckets",
  description: "Patch habit buckets by id: name, color (null clears).",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            color: { type: ["string", "null"] },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const deleteHabitBucketsTool: Anthropic.Tool = {
  name: "delete_habit_buckets",
  description:
    "Delete habit buckets by id. Habits in the bucket are kept — they become unsorted.",
  input_schema: {
    type: "object",
    properties: {
      bucketIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["bucketIds"],
  } as Anthropic.Tool["input_schema"],
};

const addHabitsTool: Anthropic.Tool = {
  name: "add_habits",
  description:
    "Create habit trackers. A habit watches the occurrence completions of the REPEATING top-level items linked to it (a task/goal with a repeat rule, or a recurring plan). Ids are minted by the app and reported back.",
  input_schema: {
    type: "object",
    properties: {
      habits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            bucketId: {
              type: ["string", "null"],
              description:
                "One of the habit bucket ids (NOT a category id), or null for unsorted.",
            },
            color: {
              type: ["string", "null"],
              description: "Optional 6-digit hex color.",
            },
            itemPlannerIds: {
              type: "array",
              items: { type: "string" },
              description:
                "Repeating top-level item ids this habit tracks (draft ids work too).",
            },
          },
          required: ["name"],
        },
      },
    },
    required: ["habits"],
  } as Anthropic.Tool["input_schema"],
};

const updateHabitsTool: Anthropic.Tool = {
  name: "update_habits",
  description:
    "Patch habit trackers by id: name, color (null clears), bucketId (a habit bucket id, null unsorts), or replace the tracked-item set wholesale via itemPlannerIds. For incremental item changes prefer add_habit_items / remove_habit_items.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            color: { type: ["string", "null"] },
            bucketId: { type: ["string", "null"] },
            itemPlannerIds: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  } as Anthropic.Tool["input_schema"],
};

const deleteHabitsTool: Anthropic.Tool = {
  name: "delete_habits",
  description:
    "Delete habit trackers by id. The tracked items themselves are never deleted — only the tracker.",
  input_schema: {
    type: "object",
    properties: {
      habitIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["habitIds"],
  } as Anthropic.Tool["input_schema"],
};

const addHabitItemsTool: Anthropic.Tool = {
  name: "add_habit_items",
  description:
    "Add tracked items (repeating top-level item ids) to one habit. Items already tracked are skipped; non-repeating items are refused.",
  input_schema: {
    type: "object",
    properties: {
      habitId: { type: "string" },
      itemIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["habitId", "itemIds"],
  } as Anthropic.Tool["input_schema"],
};

const removeHabitItemsTool: Anthropic.Tool = {
  name: "remove_habit_items",
  description: "Remove tracked items from one habit.",
  input_schema: {
    type: "object",
    properties: {
      habitId: { type: "string" },
      itemIds: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["habitId", "itemIds"],
  } as Anthropic.Tool["input_schema"],
};

function parseGoalIds(input: unknown): string[] {
  const goalIds = (input as { goalIds?: unknown } | null)?.goalIds;
  if (!Array.isArray(goalIds)) return [];
  return goalIds.filter((id): id is string => typeof id === "string");
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

// The user's key is at work here, so surface Anthropic failures in words that
// point at the fix rather than raw SDK messages.
function describeAssistantError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic rejected your API key — check it under Settings → AI assistant.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Your Anthropic account is rate-limited right now — wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Anthropic — check your connection and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    if (typeof err.status === "number" && err.status >= 500) {
      return "Anthropic is overloaded right now — try again in a moment.";
    }
    return `${err.status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}

// Stamp cache_control on the last content block of a message, normalizing a
// string content into a single text block. The cast covers the ThinkingBlock
// variant of the union (no cache_control field) — we never emit thinking
// blocks, and every block we mark (text / tool_use / tool_result) supports it.
function markLastBlock(
  content: Anthropic.MessageParam["content"],
): Anthropic.ContentBlockParam[] {
  if (typeof content === "string") {
    return [{ type: "text", text: content, cache_control: EPHEMERAL_CACHE }];
  }
  if (content.length === 0) return content;
  const lastIndex = content.length - 1;
  return content.map((block, i) =>
    i === lastIndex
      ? ({ ...block, cache_control: EPHEMERAL_CACHE } as Anthropic.ContentBlockParam)
      : block,
  );
}

// Produce a cache-marked COPY of the pristine messages array (never mutate the
// original — markers must not accumulate across iterations). Two message-level
// write breakpoints, plus bp1 on the system block = 3 total, under the 4-marker
// cap. Cache READS happen automatically against the longest matching prefix; a
// breakpoint only controls where a cache entry is WRITTEN:
//   - historyBoundaryIndex: the last pure-history message before the
//     context-bearing final user message, so the NEXT user turn (whose history
//     extends this one byte-identically) reads the whole prior conversation
//     from cache. Skipped (< 0) when there is no prior history.
//   - the last message: extends the write frontier to the end of the current
//     transcript, so the NEXT loop iteration reads everything this one wrote.
// Caveat: cache lookback spans the last 20 content blocks, so a single
// iteration appending >20 blocks (a very large parallel tool batch) can miss
// the previous entry and re-bill that stretch — acceptable.
function withCacheBreakpoints(
  messages: Anthropic.MessageParam[],
  historyBoundaryIndex: number,
): Anthropic.MessageParam[] {
  const markIndices = new Set<number>();
  if (historyBoundaryIndex >= 0) markIndices.add(historyBoundaryIndex);
  markIndices.add(messages.length - 1);
  return messages.map((message, i) =>
    markIndices.has(i)
      ? { ...message, content: markLastBlock(message.content) }
      : message,
  );
}

export async function runAssistantTurn({
  currentForest,
  currentTemplates,
  currentPrecedence,
  currentHabits,
  recurringPlanIds,
  history,
  focus,
  categories,
  locations,
  today,
  intent,
  apiKey,
  baseURL,
  signal,
  onText,
  onForest,
  onTemplates,
  onWindows,
  onPrecedence,
  onHabits,
  onShow,
  onStatus,
  onDone,
  onError,
}: RunAssistantTurnArgs): Promise<void> {
  const client = createBrowserAnthropicClient(apiKey, baseURL);

  // The turn's working copy: deterministic edit tools mutate this (via the
  // pure draftForestOps functions), so later reads within the same turn see
  // earlier edits. The caller mirrors each edit through forest events.
  let workingForest: DraftForest = currentForest;
  const getGoal = (id: string): DraftNode | undefined =>
    workingForest.goals.find((g) => g.id === id);

  // Same pattern for templates — a flat list, so no index/fetch dance: the
  // full list rides in the prompt and ops emit the whole next array.
  let workingTemplates: DraftTemplate[] = currentTemplates;

  // And for the categories domain (records + their windows): built from the
  // caller's categories, ops emit the whole next state.
  let workingWindows: DraftWindowsState = {
    windows: categories.flatMap((c) =>
      c.timeSlots.map(
        (w): DraftTimeWindow => ({
          id: w.id,
          categoryId: c.id,
          day: w.day,
          startTime: w.startTime,
          endTime: w.endTime,
        }),
      ),
    ),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      parentId: c.parentId,
      locationId: c.locationId,
      useTimeWindows: c.useTimeWindows,
      isStrict: c.isStrict,
      confineToOwnWindows: c.confineToOwnWindows,
    })),
  };

  // And for precedence (queues + dependency edges): full state in the prompt,
  // ops emit the whole next state. Forest edits inside the turn prune it (a
  // deleted goal must not linger as a queue member). The initial prune heals
  // a caller that missed a prune event on an aborted stream.
  const initialPrune = pruneDraftPrecedence(currentPrecedence, currentForest);
  let workingPrecedence: DraftPrecedenceState = initialPrune.state;

  // Habit trackers ride the same full-state contract and the same
  // prune-with-the-forest rule (a deleted item must not linger as tracked).
  const initialHabitPrune = pruneDraftHabits(currentHabits, currentForest);
  let workingHabits: DraftHabitsState = initialHabitPrune.state;
  const recurringPlanIdSet = new Set(recurringPlanIds);

  const existingGoalIds = new Set(
    currentForest.goals.map((g) => g.id).filter((id) => id.length > 0),
  );
  const validLocationIds = new Set(locations.map((l) => l.id));
  // Category ids and names must be read from the working state, not the
  // turn-start snapshot — categories created or renamed by earlier tool calls
  // in this same turn are immediately referenceable.
  const currentCategoryIds = () =>
    new Set(workingWindows.categories.map((c) => c.id));
  const categoryName = (id: string): string =>
    workingWindows.categories.find((c) => c.id === id)?.name ?? id;

  // Trees the model may legitimately modify this turn: the focused goal is
  // pre-fetched in the prompt; everything else must go through get_goal_trees
  // first. Guards against complete-tree proposals silently dropping subtasks
  // the model never saw.
  const fetchedGoalIds = new Set<string>();
  if (focus?.rootId) fetchedGoalIds.add(focus.rootId);

  // The system is the byte-stable cached prefix (tools + static instructions);
  // all turn-varying data rides trailing the final user message instead.
  const systemBlocks =
    intent === "onboarding" ? SYSTEM_BLOCKS_ONBOARDING : SYSTEM_BLOCKS_DEFAULT;
  const dynamicContext = buildDynamicContext({
    currentForest,
    currentTemplates,
    currentPrecedence: workingPrecedence,
    currentHabits: workingHabits,
    focus,
    categories,
    locations,
    today,
  });

  // Callback dispatch replacing the old SSE emit — same event names and
  // payload shapes, including the normalize pass the SSE client ran, so the
  // caller's contract is unchanged.
  const send = (event: string, data: unknown) => {
    switch (event) {
      case "text":
        onText((data as { delta: string }).delta);
        break;
      case "forest": {
        const { callIndex, complete, fromOps } = data as {
          callIndex?: unknown;
          complete?: unknown;
          fromOps?: unknown;
        };
        onForest({
          callIndex: typeof callIndex === "number" ? callIndex : 0,
          proposal: data,
          complete: complete === true || fromOps === true,
        });
        break;
      }
      case "templates": {
        const templates = normalizeDraftTemplates(data);
        if (templates) onTemplates(templates);
        break;
      }
      case "windows": {
        const state = normalizeDraftWindowsState(data);
        if (state) onWindows(state);
        break;
      }
      case "precedence": {
        const state = normalizeDraftPrecedenceState(data);
        if (state) onPrecedence(state);
        break;
      }
      case "habits": {
        const state = normalizeDraftHabitsState(data);
        if (state) onHabits(state);
        break;
      }
      case "status": {
        const { tool, count } = data as { tool?: unknown; count?: unknown };
        onStatus?.({
          tool: typeof tool === "string" ? tool : "",
          count: typeof count === "number" ? count : 0,
        });
        break;
      }
      case "show": {
        const { goalIds, all } = data as { goalIds?: unknown; all?: unknown };
        onShow({
          goalIds: Array.isArray(goalIds)
            ? goalIds.filter((id): id is string => typeof id === "string")
            : [],
          all: all === true,
        });
        break;
      }
      case "done":
        onDone((data as { stopReason: string | null }).stopReason);
        break;
      case "error":
        onError((data as { message: string }).message);
        break;
    }
  };

  // Streamed proposals are keyed by call index so the caller can fold
  // multiple propose_goals calls from one turn without them clobbering each
  // other's merges.
  let proposeCallCounter = 0;

  if (initialPrune.changed) {
    send("precedence", workingPrecedence);
  }
  if (initialHabitPrune.changed) {
    send("habits", workingHabits);
  }

  const isProposalGoalAllowed = (goal: unknown): boolean => {
    const id = (goal as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || id.length === 0) return true; // new goal
    if (!existingGoalIds.has(id)) return true; // unknown id -> new goal
    return fetchedGoalIds.has(id);
  };

  const filterProposal = (partial: unknown) => {
    const { goals, deletedGoalIds } = (partial ?? {}) as {
      goals?: unknown;
      deletedGoalIds?: unknown;
    };
    const allGoals = Array.isArray(goals) ? goals : [];
    return {
      goals: allGoals.filter(isProposalGoalAllowed),
      rejectedIds: allGoals
        .map((g) => (g as { id?: unknown } | null)?.id)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            existingGoalIds.has(id) &&
            !fetchedGoalIds.has(id),
        ),
      deletedGoalIds: deletedGoalIds ?? [],
    };
  };

  const executeGetGoalTrees = (input: unknown): string => {
    const ids = parseGoalIds(input).slice(0, MAX_TREES_PER_FETCH);
    const trees: DraftNode[] = [];
    const missingIds: string[] = [];
    for (const id of ids) {
      const goal = getGoal(id);
      if (goal) {
        trees.push(goal);
        fetchedGoalIds.add(id);
      } else {
        missingIds.push(id);
      }
    }
    return JSON.stringify({ trees, missingIds });
  };

  // Forest edits can orphan precedence references (a deleted or retyped root
  // that was a queue member or dependency endpoint). Mirrors the thunk's
  // central pruning inside the turn; the caller hears about it through the
  // same full-state event ops use.
  const prunePrecedenceAgainstForest = () => {
    const pruned = pruneDraftPrecedence(workingPrecedence, workingForest);
    if (pruned.changed) {
      workingPrecedence = pruned.state;
      send("precedence", workingPrecedence);
    }
    const habitPruned = pruneDraftHabits(workingHabits, workingForest);
    if (habitPruned.changed) {
      workingHabits = habitPruned.state;
      send("habits", workingHabits);
    }
  };

  // Adopt an edit-tool result: advance the working copy, mirror changed goals
  // to the caller through the same forest-event path proposals use (fromOps
  // marks the trees as code-computed — the caller merge then trusts null
  // categoryId as an intentional clear rather than backfilling it), and
  // summarize for the model's tool_result.
  const applyOpResult = (result: DraftOpsResult, appliedVerb: string): string => {
    workingForest = result.forest;
    const changed =
      result.updatedRootIds.length > 0 || result.deletedGoalIds.length > 0;
    if (changed) {
      send("forest", {
        callIndex: proposeCallCounter++,
        goals: result.updatedRootIds.map((id) => getGoal(id)).filter(Boolean),
        deletedGoalIds: result.deletedGoalIds,
        fromOps: true,
      });
      prunePrecedenceAgainstForest();
    }
    const parts: string[] = [];
    if (changed) {
      parts.push(`${appliedVerb} — the user sees it as a pending change.`);
    }
    if (result.failures.length > 0) {
      parts.push(
        `Failed: ${result.failures
          .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
          .join("; ")}.`,
      );
    }
    return parts.join(" ") || "Nothing changed.";
  };

  // Overlapping windows are accepted by the ops (a batch may be fixed by a
  // later call) but flagged straight back to the model, which the prompt
  // instructs to resolve before ending its turn. Only pairs involving windows
  // this op touched are reported, so pre-existing overlaps in the user's data
  // don't nag on every op.
  const MAX_REPORTED_OVERLAPS = 5;
  const describeWindow = (w: DraftTimeWindow): string =>
    `"${categoryName(w.categoryId)}" ${
      DAY_NAMES[w.day]
    } ${w.startTime}-${w.endTime} (${w.id})`;
  const buildOverlapNote = (
    state: DraftWindowsState,
    touchedIds: ReadonlySet<string>,
  ): string => {
    const overlaps = findWindowOverlaps(state.windows, touchedIds);
    if (overlaps.length === 0) return "";
    const listed = overlaps
      .slice(0, MAX_REPORTED_OVERLAPS)
      .map(({ a, b }) => `${describeWindow(a)} overlaps ${describeWindow(b)}`)
      .join("; ");
    const more =
      overlaps.length > MAX_REPORTED_OVERLAPS
        ? ` (+${overlaps.length - MAX_REPORTED_OVERLAPS} more)`
        : "";
    return ` OVERLAP WARNING: ${listed}${more}. Category windows must never overlap — adjust or delete the conflicting windows now.`;
  };

  // Categories sibling of applyTemplateOpResult — same full-state contract.
  const applyWindowOpResult = (
    result: DraftWindowOpsResult,
    appliedVerb: string,
  ): string => {
    workingWindows = result.state;
    if (result.changed) {
      send("windows", {
        windows: workingWindows.windows,
        categories: workingWindows.categories,
      });
    }
    const parts: string[] = [];
    if (result.changed) {
      parts.push(
        `${appliedVerb} — the user sees it as a pending change on the Categories tab.`,
      );
    }
    if (result.autoEnabledCategoryIds.length > 0) {
      parts.push(
        `Auto-enabled windows for: ${result.autoEnabledCategoryIds
          .map((id) => categoryName(id))
          .join(", ")} — tell the user.`,
      );
    }
    if (result.failures.length > 0) {
      parts.push(
        `Failed: ${result.failures
          .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
          .join("; ")}.`,
      );
    }
    return parts.join(" ") || "Nothing changed.";
  };

  // Precedence sibling — same full-state contract as templates/windows.
  // Cycle refusals arrive as failures whose reason carries the closing path;
  // the model is instructed to relay it in plain words.
  const applyPrecedenceOpResult = (
    result: DraftPrecedenceOpsResult,
    appliedVerb: string,
  ): string => {
    workingPrecedence = result.state;
    if (result.changed) {
      send("precedence", workingPrecedence);
    }
    const parts: string[] = [];
    if (result.changed) {
      parts.push(
        `${appliedVerb} — the user sees it as a pending change on the Queues tab.`,
      );
    }
    if (result.failures.length > 0) {
      parts.push(
        `Failed: ${result.failures
          .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
          .join("; ")}.`,
      );
    }
    return parts.join(" ") || "Nothing changed.";
  };

  // Habit sibling — same full-state contract as templates/windows/precedence.
  const applyHabitOpResult = (
    result: DraftHabitOpsResult,
    appliedVerb: string,
  ): string => {
    const changed = !draftHabitsStateEqual(workingHabits, result.state);
    workingHabits = result.state;
    if (changed) {
      send("habits", workingHabits);
    }
    const parts: string[] = [];
    if (changed) {
      parts.push(
        `${appliedVerb} — the user sees it as a pending change on the Habits tab.`,
      );
    }
    if (result.failures.length > 0) {
      parts.push(
        `Failed: ${result.failures
          .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
          .join("; ")}.`,
      );
    }
    return parts.join(" ") || "Nothing changed.";
  };

  // Template sibling of applyOpResult. The event carries the full
  // authoritative array — small list, last write wins, no caller folding.
  const applyTemplateOpResult = (
    result: DraftTemplateOpsResult,
    appliedVerb: string,
  ): string => {
    workingTemplates = result.templates;
    if (result.changed) {
      send("templates", { templates: workingTemplates });
    }
    const parts: string[] = [];
    if (result.changed) {
      parts.push(
        `${appliedVerb} — the user sees it as a pending change on the Week tab.`,
      );
    }
    if (result.failures.length > 0) {
      parts.push(
        `Failed: ${result.failures
          .map((f) => `${f.id ?? "(no id)"}: ${f.reason}`)
          .join("; ")}.`,
      );
    }
    return parts.join(" ") || "Nothing changed.";
  };

  try {
    const messages: Anthropic.MessageParam[] = history
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Deliver the live state trailing the final user message rather than in the
    // system prompt: history is prose-only (rebuilt each send), so the shared
    // prefix (tools + static system + prior history) stays byte-stable and
    // cacheable across user turns. The dynamic block leads with a supersedence
    // note so an earlier turn's context (gone from history) can't mislead.
    const contextBlock: Anthropic.TextBlockParam = {
      type: "text",
      text: `<current_state>\nThis is the user's live planning data as of this message; it supersedes any state described earlier in the conversation.\n\n${dynamicContext}\n</current_state>`,
    };
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      const userText = typeof last.content === "string" ? last.content : "";
      messages[messages.length - 1] = {
        role: last.role,
        content: userText
          ? [contextBlock, { type: "text", text: userText }]
          : [contextBlock],
      };
    } else {
      messages.push({ role: "user", content: [contextBlock] });
    }
    // The pure-history boundary: the message before the context-bearing final
    // user message. Fixed for the turn (messages only grows via push), and < 0
    // when there is no prior history (nothing to cache across turns yet).
    const historyBoundaryIndex = messages.length - 2;

    // Per-send usage totals, logged in dev to verify caching engages
    // (cache_read_input_tokens should be > 0 from iteration 2 onward).
    const usageTotals = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    let stopReason: string | null = null;

    // Prose segments before and after a tool call are separate content
    // blocks; the caller concatenates all text into one bubble, so without an
    // injected break they fuse mid-sentence
    // ("...your goals!Your planning library...").
    let anyTextSent = false;
    let needsSeparator = false;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      // The abort signal fires when the user hits Stop or closes the modal.
      // Forwarding it aborts the upstream Anthropic request so the user stops
      // paying for tokens nobody will receive.
      const anthropicStream = client.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // Output tokens are the priciest; medium effort consolidates tool
          // calls and terses replies. One-line revert if quality drops.
          output_config: { effort: "medium" },
          system: systemBlocks,
          messages: withCacheBreakpoints(messages, historyBoundaryIndex),
          tools: [
            searchItemsTool,
            getGoalTreesTool,
            updateItemsTool,
            moveItemTool,
            addItemsTool,
            deleteItemsTool,
            addTemplatesTool,
            updateTemplatesTool,
            deleteTemplatesTool,
            addTimeWindowsTool,
            updateTimeWindowsTool,
            deleteTimeWindowsTool,
            addCategoriesTool,
            updateCategoriesTool,
            deleteCategoriesTool,
            addQueuesTool,
            updateQueuesTool,
            deleteQueuesTool,
            addQueueMembersTool,
            moveQueueMemberTool,
            removeQueueMembersTool,
            addDependenciesTool,
            removeDependenciesTool,
            addHabitBucketsTool,
            updateHabitBucketsTool,
            deleteHabitBucketsTool,
            addHabitsTool,
            updateHabitsTool,
            deleteHabitsTool,
            addHabitItemsTool,
            removeHabitItemsTool,
            proposeGoalsTool,
            showGoalsTool,
          ],
        },
        { signal },
      );

      let toolInputAccumulator = "";
      let currentToolName: string | null = null;
      let currentProposeCallIndex = 0;
      let lastEmittedProposalJson: string | null = null;
      // The final stamped re-emit (in the tool-execution pass below) must
      // reuse the callIndex the partial deltas streamed under, so the caller
      // fold replaces them instead of stacking a second proposal.
      const proposeCallIndexByToolUseId = new Map<string, number>();

      for await (const event of anthropicStream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            toolInputAccumulator = "";
            currentToolName = event.content_block.name;
            if (currentToolName === "propose_goals") {
              currentProposeCallIndex = proposeCallCounter++;
              proposeCallIndexByToolUseId.set(
                event.content_block.id,
                currentProposeCallIndex,
              );
            }
            if (anyTextSent) needsSeparator = true;
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            if (needsSeparator) {
              needsSeparator = false;
              send("text", { delta: "\n\n" });
            }
            anyTextSent = true;
            send("text", { delta: event.delta.text });
          } else if (event.delta.type === "input_json_delta") {
            toolInputAccumulator += event.delta.partial_json;
            if (currentToolName !== "propose_goals") continue;
            // Best-effort partial parse. `Allow.ALL` lets partial-json fill
            // in missing brackets/quotes so we can extract whatever complete
            // goals have landed so far.
            try {
              const partial: unknown = parsePartial(
                toolInputAccumulator,
                Allow.ALL,
              );
              if (partial && typeof partial === "object" && "goals" in partial) {
                const filtered = filterProposal(partial);
                const proposal = {
                  callIndex: currentProposeCallIndex,
                  goals: filtered.goals,
                  deletedGoalIds: filtered.deletedGoalIds,
                };
                const proposalJson = JSON.stringify(proposal);
                if (proposalJson !== lastEmittedProposalJson) {
                  lastEmittedProposalJson = proposalJson;
                  send("forest", proposal);
                }
              }
            } catch {
              // Not yet parseable — wait for more deltas.
            }
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolName === "show_goals") {
            try {
              const input: unknown = JSON.parse(toolInputAccumulator || "{}");
              const { all } = (input ?? {}) as { all?: unknown };
              send("show", {
                goalIds: parseGoalIds(input),
                all: all === true,
              });
            } catch {
              // Malformed tool input — nothing to show.
            }
          }
          currentToolName = null;
        }
      }

      const finalMessage = await anthropicStream.finalMessage();
      stopReason = finalMessage.stop_reason;

      const usage = finalMessage.usage;
      usageTotals.input_tokens += usage.input_tokens ?? 0;
      usageTotals.output_tokens += usage.output_tokens ?? 0;
      usageTotals.cache_creation_input_tokens +=
        usage.cache_creation_input_tokens ?? 0;
      usageTotals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[assistant] iter ${turn}: in=${usage.input_tokens ?? 0} out=${
            usage.output_tokens ?? 0
          } cacheWrite=${usage.cache_creation_input_tokens ?? 0} cacheRead=${
            usage.cache_read_input_tokens ?? 0
          }`,
        );
      }

      if (finalMessage.stop_reason !== "tool_use") break;

      const toolUses = finalMessage.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (toolUses.length === 0) break;

      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
        const input = tu.input as Record<string, unknown>;
        let content: string;
        switch (tu.name) {
          case "get_goal_trees": {
            send("status", {
              tool: tu.name,
              count: parseGoalIds(tu.input).length,
            });
            content = executeGetGoalTrees(tu.input);
            break;
          }
          case "search_items": {
            send("status", { tool: tu.name, count: 1 });
            const query = typeof input?.query === "string" ? input.query : "";
            content = JSON.stringify({
              hits: searchDraftItems(workingForest, query, MAX_SEARCH_RESULTS),
            });
            break;
          }
          case "update_items": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftItemUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            content = applyOpResult(
              updateDraftItems(workingForest, updates, currentCategoryIds()),
              `Updated ${updates.length} item(s)`,
            );
            break;
          }
          case "move_item": {
            send("status", { tool: tu.name, count: 1 });
            content = applyOpResult(
              moveDraftItem(
                workingForest,
                {
                  itemId:
                    typeof input?.itemId === "string" ? input.itemId : "",
                  newParentId:
                    typeof input?.newParentId === "string"
                      ? input.newParentId
                      : "",
                  afterSiblingId:
                    typeof input?.afterSiblingId === "string"
                      ? input.afterSiblingId
                      : undefined,
                  atStart: input?.atStart === true,
                },
                workingPrecedence,
              ),
              "Moved the item",
            );
            break;
          }
          case "add_items": {
            const items = (
              Array.isArray(input?.items) ? input.items : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            content = applyOpResult(
              addDraftItems(workingForest, {
                parentId:
                  typeof input?.parentId === "string" ? input.parentId : "",
                items,
                afterSiblingId:
                  typeof input?.afterSiblingId === "string"
                    ? input.afterSiblingId
                    : undefined,
                atStart: input?.atStart === true,
              }),
              `Added ${items.length} item(s) with draft ids (fetch the goal tree to read them)`,
            );
            break;
          }
          case "delete_items": {
            const itemIds = parseStringArray(input?.itemIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: itemIds.length });
            content = applyOpResult(
              deleteDraftItems(workingForest, itemIds),
              `Deleted ${itemIds.length} item(s)`,
            );
            break;
          }
          case "add_templates": {
            const items = (
              Array.isArray(input?.templates) ? input.templates : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            const before = new Set(workingTemplates.map((t) => t.id));
            const result = addDraftTemplates(
              workingTemplates,
              items,
              validLocationIds,
            );
            const minted = result.templates.filter((t) => !before.has(t.id));
            const mintedNote =
              minted.length > 0
                ? ` Assigned ids: ${minted
                    .map((t) => `"${t.title}" = ${t.id}`)
                    .join(", ")}.`
                : "";
            content =
              applyTemplateOpResult(
                result,
                `Added ${minted.length} template(s)`,
              ) + mintedNote;
            break;
          }
          case "update_templates": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftTemplateUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            content = applyTemplateOpResult(
              updateDraftTemplates(workingTemplates, updates, validLocationIds),
              `Updated ${updates.length} template(s)`,
            );
            break;
          }
          case "delete_templates": {
            const templateIds = parseStringArray(input?.templateIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: templateIds.length });
            content = applyTemplateOpResult(
              deleteDraftTemplates(workingTemplates, templateIds),
              `Deleted ${templateIds.length} template(s)`,
            );
            break;
          }
          case "add_time_windows": {
            const items = (
              Array.isArray(input?.windows) ? input.windows : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            const before = new Set(workingWindows.windows.map((w) => w.id));
            const result = addDraftTimeWindows(workingWindows, items);
            const minted = result.state.windows.filter((w) => !before.has(w.id));
            const mintedNote =
              minted.length > 0
                ? ` Assigned ids: ${minted
                    .map(
                      (w) =>
                        `"${categoryName(w.categoryId)} ${
                          DAY_NAMES[w.day]
                        }" = ${w.id}`,
                    )
                    .join(", ")}.`
                : "";
            content =
              applyWindowOpResult(result, `Added ${minted.length} window(s)`) +
              mintedNote +
              buildOverlapNote(result.state, new Set(minted.map((w) => w.id)));
            break;
          }
          case "update_time_windows": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftTimeWindowUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            const result = updateDraftTimeWindows(workingWindows, updates);
            content =
              applyWindowOpResult(
                result,
                `Updated ${updates.length} window(s)`,
              ) +
              buildOverlapNote(
                result.state,
                new Set(
                  updates
                    .map((u) => u.id)
                    .filter((id): id is string => typeof id === "string"),
                ),
              );
            break;
          }
          case "delete_time_windows": {
            const windowIds = parseStringArray(input?.windowIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: windowIds.length });
            content = applyWindowOpResult(
              deleteDraftTimeWindows(workingWindows, windowIds),
              `Deleted ${windowIds.length} window(s)`,
            );
            break;
          }
          case "add_categories": {
            const items = (
              Array.isArray(input?.categories) ? input.categories : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            const before = currentCategoryIds();
            const result = addDraftCategories(
              workingWindows,
              items,
              validLocationIds,
            );
            const minted = result.state.categories.filter(
              (c) => !before.has(c.id),
            );
            const mintedNote =
              minted.length > 0
                ? ` Assigned ids: ${minted
                    .map((c) => `"${c.name}" = ${c.id}`)
                    .join(
                      ", ",
                    )}. Use these ids for windows, sub-categories, and filing items.`
                : "";
            content =
              applyWindowOpResult(
                result,
                `Created ${minted.length} categor${
                  minted.length === 1 ? "y" : "ies"
                }`,
              ) + mintedNote;
            break;
          }
          case "update_categories": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftCategoryUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            content = applyWindowOpResult(
              updateDraftCategories(workingWindows, updates, validLocationIds),
              `Updated ${updates.length} categor${
                updates.length === 1 ? "y" : "ies"
              }`,
            );
            break;
          }
          case "delete_categories": {
            const categoryIds = parseStringArray(input?.categoryIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: categoryIds.length });
            const before = workingWindows.categories;
            const result = deleteDraftCategories(workingWindows, categoryIds);
            const afterIds = new Set(result.state.categories.map((c) => c.id));
            const removed = before.filter((c) => !afterIds.has(c.id));
            const removedNote =
              removed.length > 0
                ? ` Removed (with sub-categories and windows): ${removed
                    .map((c) => `"${c.name}"`)
                    .join(
                      ", ",
                    )}. Items filed under them are kept and become uncategorized.`
                : "";
            content =
              applyWindowOpResult(
                result,
                `Deleted ${removed.length} categor${
                  removed.length === 1 ? "y" : "ies"
                }`,
              ) + removedNote;
            break;
          }
          case "add_queues": {
            const items = (
              Array.isArray(input?.queues) ? input.queues : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            const before = new Set(workingPrecedence.queues.map((q) => q.id));
            const result = addDraftQueues(
              workingPrecedence,
              items,
              workingForest,
              currentCategoryIds(),
            );
            const minted = result.state.queues.filter((q) => !before.has(q.id));
            const mintedNote =
              minted.length > 0
                ? ` Assigned ids: ${minted
                    .map((q) => `"${q.title}" = ${q.id}`)
                    .join(", ")}.`
                : "";
            content =
              applyPrecedenceOpResult(
                result,
                `Created ${minted.length} queue(s)`,
              ) + mintedNote;
            break;
          }
          case "update_queues": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftQueueUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            content = applyPrecedenceOpResult(
              updateDraftQueues(
                workingPrecedence,
                updates,
                currentCategoryIds(),
              ),
              `Updated ${updates.length} queue(s)`,
            );
            break;
          }
          case "delete_queues": {
            const queueIds = parseStringArray(input?.queueIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: queueIds.length });
            content = applyPrecedenceOpResult(
              deleteDraftQueues(workingPrecedence, queueIds),
              `Deleted ${queueIds.length} queue(s)`,
            );
            break;
          }
          case "add_queue_members": {
            const plannerIds = parseStringArray(input?.plannerIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: plannerIds.length });
            content = applyPrecedenceOpResult(
              addDraftQueueMembers(
                workingPrecedence,
                {
                  queueId:
                    typeof input?.queueId === "string" ? input.queueId : "",
                  plannerIds,
                  atIndex:
                    typeof input?.atIndex === "number"
                      ? input.atIndex
                      : undefined,
                },
                workingForest,
              ),
              `Added ${plannerIds.length} queue member(s)`,
            );
            break;
          }
          case "move_queue_member": {
            send("status", { tool: tu.name, count: 1 });
            content = applyPrecedenceOpResult(
              moveDraftQueueMember(
                workingPrecedence,
                {
                  queueId:
                    typeof input?.queueId === "string" ? input.queueId : "",
                  plannerId:
                    typeof input?.plannerId === "string" ? input.plannerId : "",
                  toIndex:
                    typeof input?.toIndex === "number"
                      ? input.toIndex
                      : Number.NaN,
                },
                workingForest,
              ),
              "Moved the queue member",
            );
            break;
          }
          case "remove_queue_members": {
            const plannerIds = parseStringArray(input?.plannerIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: plannerIds.length });
            content = applyPrecedenceOpResult(
              removeDraftQueueMembers(workingPrecedence, plannerIds),
              `Removed ${plannerIds.length} queue member(s)`,
            );
            break;
          }
          case "add_dependencies": {
            const items = (
              Array.isArray(input?.dependencies) ? input.dependencies : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            content = applyPrecedenceOpResult(
              addDraftDependencies(workingPrecedence, items, workingForest),
              `Added ${items.length} dependenc${items.length === 1 ? "y" : "ies"}`,
            );
            break;
          }
          case "remove_dependencies": {
            const items = (
              Array.isArray(input?.dependencies) ? input.dependencies : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            content = applyPrecedenceOpResult(
              removeDraftDependencies(workingPrecedence, items),
              `Removed ${items.length} dependenc${items.length === 1 ? "y" : "ies"}`,
            );
            break;
          }
          case "add_habit_buckets": {
            const items = (
              Array.isArray(input?.buckets) ? input.buckets : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            const result = addDraftHabitBuckets(workingHabits, items);
            const mintedNote =
              result.added.length > 0
                ? ` Assigned ids: ${result.added
                    .map((b) => `"${b.name}" = ${b.id}`)
                    .join(", ")}.`
                : "";
            content =
              applyHabitOpResult(
                result,
                `Created ${result.added.length} bucket(s)`,
              ) + mintedNote;
            break;
          }
          case "update_habit_buckets": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftHabitBucketUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            content = applyHabitOpResult(
              updateDraftHabitBuckets(workingHabits, updates),
              `Updated ${updates.length} bucket(s)`,
            );
            break;
          }
          case "delete_habit_buckets": {
            const bucketIds = parseStringArray(input?.bucketIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: bucketIds.length });
            content = applyHabitOpResult(
              deleteDraftHabitBuckets(workingHabits, bucketIds),
              `Deleted ${bucketIds.length} bucket(s) (their habits are now unsorted)`,
            );
            break;
          }
          case "add_habits": {
            const items = (
              Array.isArray(input?.habits) ? input.habits : []
            ).slice(0, MAX_OP_ITEMS);
            send("status", { tool: tu.name, count: items.length });
            const result = addDraftHabits(
              workingHabits,
              items,
              workingForest,
              recurringPlanIdSet,
            );
            const mintedNote =
              result.added.length > 0
                ? ` Assigned ids: ${result.added
                    .map((h) => `"${h.name}" = ${h.id}`)
                    .join(", ")}.`
                : "";
            content =
              applyHabitOpResult(
                result,
                `Created ${result.added.length} habit(s)`,
              ) + mintedNote;
            break;
          }
          case "update_habits": {
            const updates = (
              Array.isArray(input?.updates) ? input.updates : []
            ).slice(0, MAX_OP_ITEMS) as DraftHabitUpdate[];
            send("status", { tool: tu.name, count: updates.length });
            content = applyHabitOpResult(
              updateDraftHabits(
                workingHabits,
                updates,
                workingForest,
                recurringPlanIdSet,
              ),
              `Updated ${updates.length} habit(s)`,
            );
            break;
          }
          case "delete_habits": {
            const habitIds = parseStringArray(input?.habitIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: habitIds.length });
            content = applyHabitOpResult(
              deleteDraftHabits(workingHabits, habitIds),
              `Deleted ${habitIds.length} habit(s)`,
            );
            break;
          }
          case "add_habit_items": {
            const itemIds = parseStringArray(input?.itemIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: itemIds.length });
            content = applyHabitOpResult(
              addDraftHabitItems(
                workingHabits,
                {
                  habitId:
                    typeof input?.habitId === "string" ? input.habitId : "",
                  itemIds,
                },
                workingForest,
                recurringPlanIdSet,
              ),
              `Added ${itemIds.length} tracked item(s)`,
            );
            break;
          }
          case "remove_habit_items": {
            const itemIds = parseStringArray(input?.itemIds).slice(
              0,
              MAX_OP_ITEMS,
            );
            send("status", { tool: tu.name, count: itemIds.length });
            content = applyHabitOpResult(
              removeDraftHabitItems(workingHabits, {
                habitId:
                  typeof input?.habitId === "string" ? input.habitId : "",
                itemIds,
              }),
              `Removed ${itemIds.length} tracked item(s)`,
            );
            break;
          }
          case "propose_goals": {
            const filtered = filterProposal(tu.input);
            // Stamp draft ids on the accepted goals, adopt them into the
            // turn's working copy (so same-turn fetches and edit ops see
            // them), and re-emit the stamped proposal under the callIndex its
            // id-less partials streamed with — the caller fold replaces those
            // partials with the final stamped trees.
            const normalized = normalizeDraftForest({
              goals: filtered.goals,
              deletedGoalIds: filtered.deletedGoalIds,
            });
            let assignedNote = "";
            if (normalized) {
              const { goals: stampedGoals, newRoots } = assignDraftIds(
                normalized.goals,
              );
              workingForest = mergeDraftForest(workingForest, {
                ...normalized,
                goals: stampedGoals,
              });
              prunePrecedenceAgainstForest();
              for (const root of newRoots) {
                // The model authored these trees this turn — no fetch
                // required before revising them.
                existingGoalIds.add(root.id);
                fetchedGoalIds.add(root.id);
              }
              send("forest", {
                callIndex:
                  proposeCallIndexByToolUseId.get(tu.id) ??
                  proposeCallCounter++,
                goals: stampedGoals,
                deletedGoalIds: normalized.deletedGoalIds,
                // Lets the caller tell finalized proposals from truncated
                // partials when a stream is aborted.
                complete: true,
              });
              if (newRoots.length > 0) {
                assignedNote = ` New goals were assigned draft ids: ${newRoots
                  .map((r) => `"${r.title}" = ${r.id}`)
                  .join(
                    ", ",
                  )}. Draft ids work with every tool; permanent ids replace them when the user saves.`;
              }
            }
            content =
              filtered.rejectedIds.length > 0
                ? `Proposal received, EXCEPT these goals were REJECTED because you have not fetched their trees this message: ${filtered.rejectedIds.join(", ")}. Call get_goal_trees for them, then re-propose only those goals.`
                : `Proposal received. The user sees it as a pending diff; do not repeat it.${assignedNote}`;
            break;
          }
          default:
            content = "Goals displayed.";
        }
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content,
        };
      });

      messages.push({ role: "assistant", content: finalMessage.content });
      messages.push({ role: "user", content: results });
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[assistant] send totals: in=${usageTotals.input_tokens} out=${usageTotals.output_tokens} cacheWrite=${usageTotals.cache_creation_input_tokens} cacheRead=${usageTotals.cache_read_input_tokens}`,
      );
    }

    send("done", { stopReason });
  } catch (err) {
    // User-initiated abort is a normal exit, not an error to report.
    if (!signal?.aborted) {
      send("error", { message: describeAssistantError(err) });
    }
  }
}

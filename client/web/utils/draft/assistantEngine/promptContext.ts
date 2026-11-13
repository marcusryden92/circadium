import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { DraftTemplate } from "@/utils/draft/draftTemplates";
import type { DraftPrecedenceState } from "@/utils/draft/draftPrecedence";
import type { DraftHabitsState } from "@/utils/draft/draftHabits";
import type { DraftSchedulingSettings } from "@/utils/draft/draftSettings";
import { DAY_NAMES } from "./constants";
import type {
  DraftInboxItem,
  DraftLocationRef,
  StreamDraftCategory,
  StreamDraftFocus,
} from "./types";

interface DynamicContextInput {
  currentForest: DraftForest;
  currentTemplates: DraftTemplate[];
  currentPrecedence: DraftPrecedenceState;
  currentHabits: DraftHabitsState;
  focus: StreamDraftFocus | null;
  categories: StreamDraftCategory[];
  locations: DraftLocationRef[];
  inbox: DraftInboxItem[];
  settings: DraftSchedulingSettings;
  windowExceptionIds: ReadonlySet<string>;
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
      if (goal.plannerType === "plan") {
        parts.push(goal.starts ? `at ${goal.starts}` : "NO START TIME SET");
      }
      if (goal.deadline) parts.push(`due ${goal.deadline}`);
      if (goal.completed) parts.push("completed");
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

// Nested list: top-level categories are the user's roles, children indented
// beneath their parent so the model can reason about the hierarchy it is
// allowed to edit.
function buildCategoryList(
  categories: StreamDraftCategory[],
  locations: DraftLocationRef[],
  windowExceptionIds: ReadonlySet<string>,
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
        `${indent}  - window ${w.id} | ${DAY_NAMES[w.day]} ${w.startTime}-${w.endTime}${
          windowExceptionIds.has(w.id)
            ? " | HAS HAND-MOVED/SKIPPED OCCURRENCES (re-timing drops them)"
            : ""
        }`,
      );
    }
    for (const child of byParent.get(category.id) ?? []) {
      emit(child, depth + 1);
    }
  };
  for (const root of byParent.get(null) ?? []) emit(root, 0);
  return lines.join("\n");
}

// End times are precomputed for the model: an overnight block's end lands on
// the NEXT day, and leaving that arithmetic to the model produces wrong
// "which morning does this collide with" conclusions.
function blockEndLabel(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return total >= 1440 ? `${hh}:${mm} next day` : `${hh}:${mm}`;
}

function movedOccurrenceEnd(
  newStart: string,
  durationMinutes: number,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(newStart);
  if (!match) return null;
  const end = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]) + durationMinutes,
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(
    end.getDate(),
  )}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
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
        `${DAY_NAMES[t.startDay]} ${t.startTime}-${blockEndLabel(t.startTime, t.duration)} (+${t.duration}min)`,
        `"${t.title}"`,
        location,
      ];
      if (t.color) parts.push(t.color);
      if (t.exceptions.length > 0) {
        const detail = t.exceptions
          .map((e) => {
            if (e.type === "deleted") return `skipped ${e.key.slice(0, 10)}`;
            const duration = e.durationMinutes ?? t.duration;
            const end = movedOccurrenceEnd(e.newStart, duration);
            return `${e.key.slice(0, 10)} occurrence moved: starts ${e.newStart}${
              end ? `, ends ${end}` : ` (+${duration}min)`
            }`;
          })
          .join("; ");
        parts.push(
          `one-off occurrences: ${detail} (re-timing the series drops these)`,
        );
      }
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
      if (queue.color) parts.push(queue.color);
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
      items.length === 0 ? "tracks nothing yet" : `tracks: ${items.join(", ")}`,
    );
    lines.push(`- ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

// The data-shaped half of the prompt: everything that changes turn to turn.
// Delivered trailing the final user message (not in the system prompt) so a
// state change never invalidates the cached system + history prefix. The
// focused goal is serialized compact — the pretty-printed form meaningfully
// inflates large trees.
export function buildDynamicContext({
  currentForest,
  currentTemplates,
  currentPrecedence,
  currentHabits,
  focus,
  categories,
  locations,
  inbox,
  settings,
  windowExceptionIds,
  today,
}: DynamicContextInput): string {
  const categoryList = buildCategoryList(
    categories,
    locations,
    windowExceptionIds,
  );

  const inboxList =
    inbox.length > 0
      ? inbox
          .map(
            (entry) =>
              `- ${entry.id} | "${entry.title}"${entry.notes ? ` | note: ${entry.notes}` : ""}`,
          )
          .join("\n")
      : "(empty)";

  const settingsList = [
    `- buffer time between placements: ${settings.bufferTimeMinutes} min`,
    `- week starts on: ${DAY_NAMES[settings.weekStartDay] ?? settings.weekStartDay}`,
    `- default transport mode: ${settings.defaultTransportMode}`,
  ].join("\n");

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

GOAL INDEX (id | type | title | category | start/deadline | size)
${buildGoalIndex(currentForest, categories)}

USER CATEGORIES (nesting = hierarchy; each line: id: name | color | @location | flags; "window" lines are that category's time windows)
${categoryList}

USER LOCATIONS (id: name) — read-only; you cannot create locations, only reference these ids
${locationList}

WEEKLY TEMPLATES (id | day start-end (+duration) | title | location | color; "one-off occurrences" are per-date skips/moves managed via update_template_exceptions — end times are precomputed, trust them)
${buildTemplateList(currentTemplates, locations)}

CAPTURE INBOX (id | title — raw jots not yet in the library; triage_items pulls them in as tasks)
${inboxList}

SCHEDULING SETTINGS (update_scheduling_settings changes these)
${settingsList}

QUEUES AND DEPENDENCIES (queues with their members in schedule order; after the blank line, the prerequisite edges)
${buildPrecedenceList(currentPrecedence, currentForest, categories)}

HABITS (buckets first, then each habit: id: "name" | bucket | color | tracked items)
${buildHabitsList(currentHabits, currentForest)}
${focusBlock}`;
}

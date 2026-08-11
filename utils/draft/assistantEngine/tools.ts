import type Anthropic from "@anthropic-ai/sdk";
import { MAX_TREES_PER_FETCH } from "./constants";

// The assistant's full tool surface. These are pure schema declarations with
// no interdependencies; the one dynamic value is MAX_TREES_PER_FETCH in the
// get_goal_trees description. ASSISTANT_TOOLS at the bottom is the array passed
// to the stream call — its ORDER is load-bearing: tools are part of the cached
// prompt prefix, so reordering would bust the Anthropic prompt cache.

// -- Reading -----------------------------------------------------------------

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

// -- Goal forest: items ------------------------------------------------------

const updateItemsTool: Anthropic.Tool = {
  name: "update_items",
  description:
    'Change fields on existing items by id — title, plannerType ("task", "goal", or "plan"; retyping a childless item to "plan" makes it a fixed-time appointment — pair it with starts), starts (plans only — the fixed ISO start date-time; null makes the plan timeless), duration (minutes), deadline (ISO date or null to clear), priority, isReady, categoryId (top-level goals only; null to clear), locationId (any item — one of the user\'s location ids, null to clear), color (top-level items only — 6-digit hex, the subtree inherits it), notes (free-text note on the item; null clears), completed (mark a task/goal done or not done; never plans or repeating items), splitting (schedulable leaves only — an object enables/adjusts chunked scheduling, null turns it off), maxMinutesPerDay (top-level goals only — the goal\'s daily limit in minutes, null to remove it), recurrence (top-level items only — repeat rule; on tasks/goals flexible per-period placement, on plans a fixed repeat stepping from starts), earliestStartDate (tasks/goals at any level — ISO date before which it may not be scheduled, null to clear), and allowedTimes (tasks/goals at any level — which weekdays / times of day it may be scheduled, null to clear). An item with subtasks is always a goal — that is enforced automatically, so you never set plannerType just to fix a parent. Structural changes (adding, moving, removing items) use the other tools.',
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
            plannerType: { type: "string", enum: ["task", "goal", "plan"] },
            starts: {
              type: ["string", "null"],
              description:
                "Plans only: the fixed ISO start date-time (local time with offset preferred). Null makes the plan timeless.",
            },
            duration: { type: "integer" },
            deadline: { type: ["string", "null"] },
            priority: { type: "integer", minimum: 1, maximum: 7 },
            isReady: { type: ["boolean", "null"] },
            categoryId: { type: ["string", "null"] },
            locationId: {
              type: ["string", "null"],
              description:
                "One of the user's location ids; null clears the item's own location.",
            },
            color: {
              type: "string",
              description:
                'Top-level items only: 6-digit hex like "#1976D2"; the subtree inherits it.',
            },
            notes: {
              type: ["string", "null"],
              description: "Free-text note on the item; null clears it.",
            },
            completed: {
              type: "boolean",
              description:
                "Mark the item done (true) or not done (false). Tasks and goals only — plans and repeating items complete per occurrence on the calendar.",
            },
            linkedItemId: {
              type: ["string", "null"],
              description:
                "Detour link, on a SUBTASK only: a top-level task/goal id whose steps the scheduler splices in at this position (the subtask's own duration is then ignored). Null unlinks. Refused when ordering already connects the two goals.",
            },
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
                "Top-level items only: an object makes the item repeat (tasks/goals: flexible per-period placement, clearing the deadline; plans: fixed repeat stepping from starts); null stops the repetition.",
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
            earliestStartDate: {
              type: ["string", "null"],
              description:
                "Tasks/goals at any level (never plans): ISO date/time before which it may not be scheduled; null clears it. Inherits down the tree.",
            },
            allowedTimes: {
              type: ["object", "null"],
              description:
                "Tasks/goals at any level (never plans): which weekdays / times of day it may be scheduled; null clears it. Inherits down the tree.",
              properties: {
                days: {
                  type: ["array", "null"],
                  items: { type: "integer", minimum: 0, maximum: 6 },
                  description:
                    "Weekdays (0=Sunday .. 6=Saturday); null or all seven = any day.",
                },
                ranges: {
                  type: ["array", "null"],
                  items: {
                    type: "object",
                    properties: {
                      startTime: { type: "string" },
                      endTime: { type: "string" },
                    },
                    required: ["startTime", "endTime"],
                  },
                  description:
                    'Times of day, 24h "HH:MM"; null = any time. endTime <= startTime runs past midnight; "23:59" = end of day.',
                },
              },
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
    "Insert new items (with optional nested children) under an existing parent — the goal itself or any node inside it. Items use the node structure WITHOUT ids (real ids are assigned when the user saves). Position works like move_item. For new TOP-LEVEL items (goals, loose tasks, fixed-time plans) use propose_goals instead.",
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
          locationId: {
            type: ["string", "null"],
            description:
              "One of the user's location ids, or null (inherits from ancestors/category).",
          },
          notes: {
            type: ["string", "null"],
            description: "Optional free-text note on the item.",
          },
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
          earliestStartDate: {
            type: ["string", "null"],
            description:
              "Tasks/goals (never plans): ISO date/time before which it may not be scheduled; null = no bound. Inherits down the tree.",
          },
          allowedTimes: {
            type: ["object", "null"],
            description:
              "Tasks/goals (never plans): which weekdays / times of day it may be scheduled; null = any. Inherits down the tree.",
            properties: {
              days: {
                type: ["array", "null"],
                items: { type: "integer", minimum: 0, maximum: 6 },
              },
              ranges: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  properties: {
                    startTime: { type: "string" },
                    endTime: { type: "string" },
                  },
                  required: ["startTime", "endTime"],
                },
              },
            },
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

// -- Goal forest: building + display -----------------------------------------

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
          starts: {
            type: ["string", "null"],
            description:
              "Plans only: the fixed ISO start date-time (the appointment's exact start). Required for a plan to appear on the calendar; always null on tasks and goals. Echo verbatim for retained plans.",
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
              'Top-level goals only: a 6-digit hex color (e.g. "#1976D2") for the whole goal; its subtasks inherit it. When creating SEVERAL related top-level items in one batch, give them all the SAME color. Never set on child nodes.',
          },
          locationId: {
            type: ["string", "null"],
            description:
              "One of the user's location ids — where this item happens — or null. Echo verbatim for retained nodes.",
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
              "Top-level items only: repeat rule. On tasks/goals the scheduler places one occurrence per period flexibly (a repeating item has no deadline); on plans it repeats on a fixed schedule stepping from starts. Echo verbatim for retained items; dropping it stops the repetition. Never set on child nodes.",
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
          earliestStartDate: {
            type: ["string", "null"],
            description:
              "Tasks and goals at ANY depth (never plans): ISO date/time before which the item may not be scheduled, or null. Inherits down the tree (set on a goal, it holds back the whole subtree). Echo verbatim for retained nodes; dropping it removes the bound.",
          },
          allowedTimes: {
            type: ["object", "null"],
            description:
              'Tasks and goals at ANY depth (never plans): restricts WHEN the item may be scheduled, or null. Inherits down the tree. Echo verbatim for retained nodes; dropping it lifts the restriction.',
            properties: {
              days: {
                type: ["array", "null"],
                items: { type: "integer", minimum: 0, maximum: 6 },
                description:
                  "Weekdays it may be scheduled (0=Sunday .. 6=Saturday); null or all seven = any day.",
              },
              ranges: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  properties: {
                    startTime: { type: "string" },
                    endTime: { type: "string" },
                  },
                  required: ["startTime", "endTime"],
                },
                description:
                  'Times of day it may be scheduled, 24h "HH:MM"; null = any time. A range whose endTime <= startTime runs past midnight; "23:59" means end of day.',
              },
            },
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

// -- Weekly templates --------------------------------------------------------

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

// -- Category time windows ---------------------------------------------------

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

// -- Categories --------------------------------------------------------------

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

// -- Precedence: queues + dependencies ---------------------------------------

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
            color: {
              type: ["string", "null"],
              description:
                "Optional 6-digit hex accent for the queue's lane on the graph view.",
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
    "Edit queues by id: title, categoryId (null clears the inherited default), color (6-digit hex accent, null clears). Partial patches — omit fields you are not changing. Membership is managed with the member tools, not here.",
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
            color: { type: ["string", "null"] },
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
    "Create prerequisite links: the predecessor must finish before the successor starts. Endpoints may be top-level items OR subtasks at any depth (subtask ids from get_goal_trees/search_items) — but never two nodes of the SAME goal (its steps are already ordered by the list). An item may have several prerequisites (it starts after ALL finish). A link that would create a loop is refused with the closing path.",
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

// -- Habit trackers ----------------------------------------------------------

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

// -- Structure + settings -----------------------------------------------------

const promoteItemTool: Anthropic.Tool = {
  name: "promote_item",
  description:
    "Break a subtask out of its goal so it becomes its own top-level item, KEEPING its identity and connections (unlike delete + recreate). A childless item becomes a ready task; one with subtasks stays a goal. Its effective category is kept; inherited constraints and any detour link are dropped.",
  input_schema: {
    type: "object",
    properties: {
      itemId: { type: "string" },
    },
    required: ["itemId"],
  } as Anthropic.Tool["input_schema"],
};

const demoteItemTool: Anthropic.Tool = {
  name: "demote_item",
  description:
    "Nest an existing top-level item as the LAST step of another top-level goal, keeping its identity. Its own category, color, daily limit, and repeat rule are dropped (it inherits the goal's); queue membership is removed; prerequisite links survive as step-level links. Refused if it would create an ordering loop.",
  input_schema: {
    type: "object",
    properties: {
      itemId: { type: "string" },
      targetGoalId: { type: "string" },
    },
    required: ["itemId", "targetGoalId"],
  } as Anthropic.Tool["input_schema"],
};

const triageItemsTool: Anthropic.Tool = {
  name: "triage_items",
  description:
    "Pull raw jots from the CAPTURE INBOX (ids from the live state) into the library as top-level tasks. Each arrives with a 30-minute placeholder duration — follow up with update_items to set real durations, deadlines, categories, or retype to goal/plan.",
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

const updateSchedulingSettingsTool: Anthropic.Tool = {
  name: "update_scheduling_settings",
  description:
    "Change the user's scheduling preferences: bufferTimeMinutes (breathing room after each placement, 0-240), weekStartDay (0 = Sunday .. 6 = Saturday), defaultTransportMode (DRIVING | TRANSIT | BICYCLING | WALKING — used for travel times between locations). Partial patches; only change what the user asked for.",
  input_schema: {
    type: "object",
    properties: {
      bufferTimeMinutes: { type: "integer", minimum: 0, maximum: 240 },
      weekStartDay: { type: "integer", minimum: 0, maximum: 6 },
      defaultTransportMode: {
        type: "string",
        enum: ["DRIVING", "TRANSIT", "BICYCLING", "WALKING"],
      },
    },
  } as Anthropic.Tool["input_schema"],
};

const updateTemplateExceptionsTool: Anthropic.Tool = {
  name: "update_template_exceptions",
  description:
    'Skip, move, or restore SPECIFIC DATED OCCURRENCES of a weekly template without changing the series — e.g. "skip my sleep block on Aug 12" or "start sleep at 01:30 the night after each late shift". skip: the occurrence on that date vanishes. move: the occurrence on `date` starts at `newStart` instead (any day/time; optional durationMinutes overrides its length for just that occurrence). restore: removes an existing skip/move so the date follows the weekly rule again. Dates must land on the template\'s weekday. This is the right tool for one-off adjustments; update_templates changes EVERY week (and re-timing a series discards its existing one-off occurrences).',
  input_schema: {
    type: "object",
    properties: {
      edits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            templateId: { type: "string" },
            skip: {
              type: "array",
              items: { type: "string" },
              description: "YYYY-MM-DD dates to skip",
            },
            move: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    description: "YYYY-MM-DD date of the occurrence to move",
                  },
                  newStart: {
                    type: "string",
                    description: "YYYY-MM-DDTHH:MM local start it moves to",
                  },
                  durationMinutes: { type: "integer", minimum: 1 },
                },
                required: ["date", "newStart"],
              },
            },
            restore: {
              type: "array",
              items: { type: "string" },
              description: "YYYY-MM-DD dates whose skip/move to undo",
            },
          },
          required: ["templateId"],
        },
      },
    },
    required: ["edits"],
  } as Anthropic.Tool["input_schema"],
};

// The array passed to every stream call. ORDER IS LOAD-BEARING — see the note
// at the top of this file. Preserve it byte-for-byte when adding tools.
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
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
  promoteItemTool,
  demoteItemTool,
  triageItemsTool,
  updateSchedulingSettingsTool,
  updateTemplateExceptionsTool,
];

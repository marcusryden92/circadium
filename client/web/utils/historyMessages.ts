// Undo-history labels, surfaced as `Undid/Redid "<label>"` toasts. Each edit
// surface imports its own entries, so the catalog doubles as an index of which
// calendar handling produces which change. Keep labels short verb phrases in
// plain language; titles ride inside typographic quotes so they never clash
// with the double quotes the toast wraps around the whole label.

const q = (title: string | null | undefined) =>
  title && title.trim() ? `“${title.trim()}”` : "item";

export const historyMessages = {
  item: {
    create: (title: string) => `create ${q(title)}`,
    addSubtask: (title: string) => `add subtask ${q(title)}`,
    delete: (title: string | null | undefined) => `delete ${q(title)}`,
    duplicate: (title: string | null | undefined) => `duplicate ${q(title)}`,
    deleteMany: (count: number) =>
      count === 1 ? "delete 1 item" : `delete ${count} items`,
    rename: (to: string) => `rename to ${q(to)}`,
    retype: (title: string, type: string) =>
      `turn ${q(title)} into a ${type}`,
    duration: (title: string, minutes: number) =>
      `set duration of ${q(title)} to ${minutes} min`,
    field: (field: string, title: string | null | undefined) =>
      `change ${field} of ${q(title)}`,
    complete: (title: string | null | undefined) => `complete ${q(title)}`,
    uncomplete: (title: string | null | undefined) =>
      `mark ${q(title)} not done`,
    ready: (title: string, ready: boolean) =>
      ready ? `mark ${q(title)} ready` : `pause ${q(title)}`,
    move: (title: string | null | undefined) => `move ${q(title)}`,
    reorder: (title: string | null | undefined) => `reorder ${q(title)}`,
    promote: (title: string) => `promote ${q(title)} to top level`,
    demote: (title: string, target: string) =>
      `nest ${q(title)} under ${q(target)}`,
    link: (title: string, target: string) =>
      `link ${q(target)} into ${q(title)}`,
    unlink: (title: string) => `remove link from ${q(title)}`,
    priorityMany: (count: number) => `set priority on ${count} items`,
    colorMany: (count: number) => `set color on ${count} items`,
    categoryMany: (count: number) => `assign category on ${count} items`,
  },
  capture: {
    jot: (title: string) => `capture ${q(title)}`,
    save: (title: string) => `save ${q(title)}`,
  },
  calendarSurface: {
    moveEvent: (title: string | null | undefined) =>
      `move ${q(title)} on the calendar`,
    resizeEvent: (title: string | null | undefined) => `resize ${q(title)}`,
    deleteOccurrence: (title: string | null | undefined) =>
      `delete an occurrence of ${q(title)}`,
    moveOccurrence: (title: string | null | undefined) =>
      `move an occurrence of ${q(title)}`,
    createPlan: (title: string) => `add plan ${q(title)}`,
  },
  template: {
    create: (title: string) => `add weekly block ${q(title)}`,
    duplicate: (title: string | null | undefined) =>
      `duplicate weekly block ${q(title)}`,
    rename: (to: string) => `rename weekly block to ${q(to)}`,
    edit: (title: string | null | undefined) =>
      `edit weekly block ${q(title)}`,
    move: (title: string | null | undefined) =>
      `move weekly block ${q(title)}`,
    resize: (title: string | null | undefined) =>
      `resize weekly block ${q(title)}`,
    delete: (title: string | null | undefined) =>
      `delete weekly block ${q(title)}`,
    restoreOccurrence: (title: string | null | undefined) =>
      `restore an occurrence of ${q(title)}`,
  },
  queue: {
    create: (title: string) => `create queue ${q(title)}`,
    rename: (to: string) => `rename queue to ${q(to)}`,
    recolor: (title: string) => `change color of queue ${q(title)}`,
    recategorize: (title: string) => `change category of queue ${q(title)}`,
    delete: (title: string | null | undefined) => `delete queue ${q(title)}`,
    addMember: (item: string | null | undefined) => `queue ${q(item)}`,
    reorderMember: (item: string | null | undefined) =>
      `reorder ${q(item)} in its queue`,
    removeMember: (item: string | null | undefined) =>
      `remove ${q(item)} from its queue`,
    reorderQueues: "reorder queues",
  },
  dependency: {
    add: (predecessor: string | null | undefined) =>
      `add prerequisite ${q(predecessor)}`,
    remove: (predecessor: string | null | undefined) =>
      `remove prerequisite ${q(predecessor)}`,
  },
  category: {
    create: (isRole: boolean) => (isRole ? "create role" : "create category"),
    rename: (to: string) => `rename to ${q(to)}`,
    field: (field: string, name: string | null | undefined) =>
      `change ${field} of ${q(name)}`,
    move: (name: string | null | undefined) => `move ${q(name)}`,
    delete: (name: string | null | undefined) => `delete ${q(name)}`,
    windowExceptions: (name: string | null | undefined) =>
      `edit window exceptions of ${q(name)}`,
  },
  weekStructure: {
    save: "edit week structure",
  },
  assistant: {
    save: "AI assistant changes",
  },
  onboarding: {
    commit: "onboarding setup",
  },
};

export type AgendaItem = {
  id: string;
  plannerId?: string;
  start: Date;
  end: Date;
  durationMinutes: number;
  title: string;
  travel: boolean;
  now: boolean;
  // True only when there is no in-progress (NOW) item and this is the next
  // upcoming row. Mutually exclusive with `now`; at most one item carries
  // this flag per agenda.
  next: boolean;
  // Minutes until start; set only on the row carrying `next`.
  startsInMinutes?: number;
  warn: boolean;
  overdue: boolean;
  pastDeadline: boolean;
  kind: "plan" | "task" | "goal" | "template" | "travel";
  categoryId?: string | null;
  categoryName?: string;
  categoryColor?: string | null;
  where?: string;
};

export type AgendaGroupHeader = {
  kind: AgendaItem["kind"];
  categoryId: string | null;
  categoryName?: string;
  categoryColor?: string | null;
};

export type AgendaRow = {
  header: AgendaGroupHeader;
  items: AgendaItem[];
};

export type DashboardGoal = {
  id: string;
  name: string;
  pct: number;
  fraction: string;
  categoryName?: string;
  categoryColor?: string | null;
  next?: string;
  deadline?: string;
};

export type DashboardSummary = {
  itemCount: number;
  plannedMinutes: number;
  overdueCount: number;
  pastDeadlineCount: number;
};

export type UncompletedItem = {
  id: string;
  plannerId: string;
  eventId: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  daysAgo: number;
  kind: "task" | "goal" | "plan";
  categoryName?: string;
  categoryColor?: string | null;
};

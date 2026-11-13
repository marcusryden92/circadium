export type TriageType = "task" | "plan" | "goal";

export const DEFAULT_DRAFT_DURATION_MIN = 30;

export const TYPE_OPTIONS: ReadonlyArray<{
  key: TriageType;
  label: string;
  sub: string;
  hint: string;
}> = [
  { key: "task", label: "task", sub: "scheduler picks a slot", hint: "1" },
  { key: "plan", label: "plan", sub: "fixed time", hint: "2" },
  { key: "goal", label: "goal", sub: "holds subtasks", hint: "3" },
];

import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Flag,
  Inbox,
  Target,
} from "lucide-react";
import type { SmartView } from "@/utils/dateUtils";

export const SMART_VIEWS: Array<{
  key: SmartView;
  label: string;
  icon: typeof Inbox;
  alert?: boolean;
}> = [
  { key: "today", label: "Today", icon: Calendar },
  { key: "this-week", label: "This week", icon: CalendarDays },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "overdue", label: "Overdue", icon: AlertTriangle, alert: true },
  { key: "all-goals", label: "All goals", icon: Target },
  { key: "all-plans", label: "All plans", icon: Flag },
  { key: "done-7d", label: "Done · 7d", icon: CheckCircle2 },
];

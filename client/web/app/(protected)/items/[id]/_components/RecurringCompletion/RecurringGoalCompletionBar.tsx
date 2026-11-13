"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import type { Planner } from "@/types/prisma";
import { Button } from "@/components/ui";
import { RecurringCompletionModal } from "./RecurringCompletionModal";
import {
  banner,
  bannerLeft,
  bannerIcon,
  bannerText,
  bannerTitle,
  bannerHint,
} from "./RecurringCompletion.css";

// Entry point for a recurring goal's completion, shown above the subtasks tree
// (whose per-row checkboxes are hidden): completion is per period, not per
// subtask, so it opens the dedicated completion modal.
export function RecurringGoalCompletionBar({ goal }: { goal: Planner }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={banner}>
        <div className={bannerLeft}>
          <span className={bannerIcon}>
            <Repeat size={16} strokeWidth={2} />
          </span>
          <div className={bannerText}>
            <span className={bannerTitle}>This goal repeats</span>
            <span className={bannerHint}>
              Completion is tracked per period, not per subtask.
            </span>
          </div>
        </div>
        <Button variant="outlined" size="sm" onClick={() => setOpen(true)}>
          Manage completion
        </Button>
      </div>
      <RecurringCompletionModal
        open={open}
        goal={goal}
        initialPeriodKey={null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

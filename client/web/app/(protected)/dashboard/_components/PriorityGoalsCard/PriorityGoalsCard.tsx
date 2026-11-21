import { space, progressTrack } from "@/lib/theme";
import {
  Caption,
  CategoryDot,
  Glass,
  Loader,
  categoryColor as resolveCategoryColor,
} from "@/components/ui";
import type { DashboardGoal } from "../../_data/types";
import {
  goalsCard,
  goalsHeader,
  goalsTitle,
  goalRow,
  goalHead,
  goalName,
  goalFraction,
  goalTrack,
  goalFill,
  goalFooter,
  goalNext,
  goalsEmpty,
} from "./PriorityGoalsCard.css";

type Props = {
  isLoaded: boolean;
  goals: DashboardGoal[];
  onOpenGoal: (goalId: string) => void;
};

export function PriorityGoalsCard({ isLoaded, goals, onOpenGoal }: Props) {
  return (
    <Glass radius="lg" className={goalsCard}>
      <div className={goalsHeader}>
        <div>
          <h2 className={goalsTitle}>Priority goals</h2>
          <Caption style={{ marginTop: space["1"], display: "inline-block" }}>
            scored by the calendar engine
          </Caption>
        </div>
        <Caption>{goals.length} shown</Caption>
      </div>
      {!isLoaded ? (
        <div className={goalsEmpty}>
          <Loader size="sm" label="Loading goals" />
        </div>
      ) : goals.length === 0 ? (
        <div className={goalsEmpty}>
          <Caption>No active goals yet.</Caption>
        </div>
      ) : (
        goals.map((g) => {
          const color = resolveCategoryColor({
            color: g.categoryColor ?? null,
          });
          return (
            <div
              key={g.id}
              className={goalRow}
              role="button"
              tabIndex={0}
              onClick={() => onOpenGoal(g.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenGoal(g.id);
                }
              }}
            >
              <div className={goalHead}>
                <CategoryDot color={color} size={9} />
                <span className={goalName}>{g.name}</span>
                <span className={goalFraction}>{g.fraction}</span>
              </div>
              <div className={`${progressTrack()} ${goalTrack}`}>
                <div
                  className={goalFill}
                  style={{
                    width: `${g.pct}%`,
                    background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 80%, transparent))`,
                  }}
                />
              </div>
              <div className={goalFooter}>
                <span className={goalNext}>
                  {g.next ? `→ ${g.next}` : "→ not yet scheduled"}
                </span>
                {g.deadline && (
                  <Caption style={{ fontSize: 9.5 }}>by {g.deadline}</Caption>
                )}
              </div>
            </div>
          );
        })
      )}
    </Glass>
  );
}

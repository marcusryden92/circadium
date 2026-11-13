"use client";

import { DashboardHeader } from "./_components/DashboardHeader/DashboardHeader";
import { AgendaCard } from "./_components/AgendaCard/AgendaCard";
import { PriorityGoalsCard } from "./_components/PriorityGoalsCard/PriorityGoalsCard";
import { useDashboardData } from "./_hooks/useDashboardData";
import { page, gridWrap, rightCol } from "./page.css";

export function DashboardClient() {
  const {
    isLoaded,
    greetingText,
    dateText,
    summary,
    uncompleted,
    agendaRows,
    goals,
    openItem,
    completeUncompleted,
    postponeUncompleted,
  } = useDashboardData();

  return (
    <div className={page}>
      <DashboardHeader
        greetingText={greetingText}
        dateText={dateText}
        summary={summary}
      />

      <div className={gridWrap}>
        <AgendaCard
          isLoaded={isLoaded}
          uncompleted={uncompleted}
          agendaRows={agendaRows}
          summary={summary}
          onOpenItem={openItem}
          onCompleteUncompleted={completeUncompleted}
          onPostponeUncompleted={postponeUncompleted}
        />

        <div className={rightCol}>
          <PriorityGoalsCard
            isLoaded={isLoaded}
            goals={goals}
            onOpenGoal={openItem}
          />
        </div>
      </div>
    </div>
  );
}

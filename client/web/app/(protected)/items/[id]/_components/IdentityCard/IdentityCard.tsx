"use client";

import { TypePickerSection } from "./TypePickerSection";
import { CategorySection } from "./CategorySection";
import { DateSection } from "./DateSection";
import { EarliestStartSection } from "./EarliestStartSection";
import { DurationSection } from "./DurationSection";
import { LocationSection } from "./LocationSection";
import { ColorSection } from "./ColorSection";
import { PrioritySection } from "./PrioritySection";
import { RecurrenceSection } from "./RecurrenceSection";
import { SplittingSection } from "./SplittingSection";
import { DailyLimitSection } from "./DailyLimitSection";
import { AllowedTimesSection } from "./AllowedTimesSection";
import {
  card,
  cardBody,
  fieldGrid,
  doubleGrid,
  rulesSlot,
} from "./IdentityCard.css";

// Row semantics: identity (type, category, color), core facts (when, how
// long), scheduling preferences (priority, earliest start — both ghost
// together for plans), then place and rules spanning the full width.
export function IdentityCard() {
  return (
    <div className={card}>
      <div className={cardBody}>
        <div className={fieldGrid}>
          <TypePickerSection />
          <div className={doubleGrid}>
            <CategorySection /> <ColorSection />
          </div>
          <EarliestStartSection />
          <DateSection />
          <PrioritySection />
          <DurationSection />
          <LocationSection />
          <div className={rulesSlot}>
            <SplittingSection />
            <RecurrenceSection />
            <DailyLimitSection />
            <AllowedTimesSection />
          </div>
        </div>
      </div>
    </div>
  );
}

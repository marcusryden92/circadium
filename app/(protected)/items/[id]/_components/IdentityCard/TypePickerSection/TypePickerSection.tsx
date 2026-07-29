"use client";

import type { PlannerType } from "@/generated/client";
import { FieldStack } from "@/components/ui";
import { useItem } from "../../ItemContext";
import {
  typePicker,
  typePickerThumb,
  typePickerBtn,
} from "./TypePickerSection.css";

export function TypePickerSection() {
  const { item, setPlannerType } = useItem();

  return (
    <FieldStack label="Type">
      <div className={typePicker}>
        <span
          className={typePickerThumb}
          data-position={
            item.plannerType === "plan"
              ? "0"
              : item.plannerType === "task"
                ? "1"
                : "2"
          }
          aria-hidden="true"
        />
        {(["plan", "task", "goal"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={typePickerBtn}
            data-active={item.plannerType === t}
            onClick={() => setPlannerType(t as PlannerType)}
          >
            {t}
          </button>
        ))}
      </div>
    </FieldStack>
  );
}

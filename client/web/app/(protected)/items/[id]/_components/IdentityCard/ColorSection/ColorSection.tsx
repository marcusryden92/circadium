"use client";

import { FieldStack } from "@/components/ui";
import { PopoverColorPicker } from "@/components/events/PopoverColorPicker";
import { calendarColors } from "@/data/calendarColors";
import { useItem } from "../../ItemContext";

export function ColorSection() {
  const { item, changeColor } = useItem();

  return (
    <FieldStack label="Color">
      <PopoverColorPicker
        currentColor={item.color || calendarColors[0]}
        onChange={changeColor}
      />
    </FieldStack>
  );
}

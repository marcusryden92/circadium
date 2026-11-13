"use client";

import { useTheme } from "./ThemeProvider";
import { categoryColor, type CategoryLike } from "@/lib/theme";

export function useResolvedCategoryColor(
  category: CategoryLike | undefined | null,
): string {
  const { dark } = useTheme();
  return categoryColor(category, dark ? "dark" : "light");
}

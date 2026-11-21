export type CategoryLike = { color?: string | null };

const FALLBACK_LIGHT = "#3b82f6";
const FALLBACK_DARK = "#60a5fa";

export function categoryColor(
  category: CategoryLike | undefined | null,
  theme: "light" | "dark" = "light",
): string {
  if (category?.color) return category.color;
  return theme === "dark" ? FALLBACK_DARK : FALLBACK_LIGHT;
}

export function categoryGlow(color: string): string {
  return `0 0 8px ${color}88`;
}

export function categoryGradient(color: string): string {
  return `linear-gradient(90deg, ${color}, ${color}cc)`;
}

export function categoryTint(color: string, alpha = 0.2): string {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (
    Number.isNaN(r) ||
    Number.isNaN(g) ||
    Number.isNaN(b)
  ) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

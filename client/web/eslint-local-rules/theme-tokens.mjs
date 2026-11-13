// Local ESLint plugin enforcing the theme scales (lib/theme/scales.ts) over raw
// pixel values. Spacing properties must reference a `space` token and radius
// properties a `radii` token instead of hardcoded numbers or single px strings.
//
// Scope notes:
// - Only single numeric / single-`px` string values are flagged. Multi-value
//   shorthands ("9px 12px"), percentages, `auto`, `calc(...)`, and any
//   non-literal (a token reference, template, or call) are left alone.
// - `0` is always allowed.
// - Typography (fontSize/fontWeight/fontFamily) is deliberately NOT covered:
//   the type scale is expressed as preset class compositions (display.*/text.*),
//   not property values, so it can't be enforced by a value-level rule. Migrate
//   those by composing presets, not by swapping in a token.

const SPACING_PROPS = new Set([
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "paddingBlock",
  "paddingInline",
  "paddingBlockStart",
  "paddingBlockEnd",
  "paddingInlineStart",
  "paddingInlineEnd",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "marginBlock",
  "marginInline",
  "marginBlockStart",
  "marginBlockEnd",
  "marginInlineStart",
  "marginInlineEnd",
  "gap",
  "rowGap",
  "columnGap",
  "gridGap",
]);

const RADIUS_PROPS = new Set([
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderStartStartRadius",
  "borderStartEndRadius",
  "borderEndStartRadius",
  "borderEndEndRadius",
]);

const SINGLE_PX = /^-?\d*\.?\d+px$/;

// value (px) -> `space` token key, and value -> `radii` token key. Sorted by
// value so the fixer can snap an off-scale value to its nearest token; exact
// ticks (the common case) resolve to themselves.
const SPACE_TICKS = [
  [0, "none"],
  [1, "px"],
  [2, "0.5"],
  [4, "1"],
  [6, "1.5"],
  [8, "2"],
  [10, "2.5"],
  [12, "3"],
  [14, "3.5"],
  [16, "4"],
  [20, "5"],
  [24, "6"],
  [28, "7"],
  [32, "8"],
  [40, "10"],
  [48, "12"],
  [56, "14"],
  [64, "16"],
  [80, "20"],
];

const RADII_TICKS = [
  [6, "xs"],
  [8, "sm"],
  [10, "sm+2"],
  [12, "md"],
  [14, "md+2"],
  [16, "lg"],
  [18, "lg+2"],
  [20, "xl"],
  [22, "xl+2"],
  [24, "2xl"],
  [30, "3xl"],
  [999, "pill"],
];

// Nearest tick to `v`; on an exact tie, round to the larger token.
function nearestKey(ticks, v) {
  let best = ticks[0];
  let bestDist = Infinity;
  for (const tick of ticks) {
    const dist = Math.abs(tick[0] - v);
    if (dist < bestDist || (dist === bestDist && tick[0] > best[0])) {
      best = tick;
      bestDist = dist;
    }
  }
  return best[1];
}

function propName(node) {
  const key = node.key;
  if (!node.computed && key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

// Returns the offending raw value as a string, or null if the value is allowed
// (zero, a token reference, a percentage/auto/calc, a multi-value shorthand…).
function rawValue(value) {
  if (value.type === "Literal") {
    if (typeof value.value === "number") {
      return value.value === 0 ? null : String(value.value);
    }
    if (typeof value.value === "string") {
      const s = value.value.trim();
      if (s === "0" || s === "0px" || s === "") return null;
      return SINGLE_PX.test(s) ? s : null;
    }
    return null;
  }
  if (
    value.type === "UnaryExpression" &&
    value.operator === "-" &&
    value.argument.type === "Literal" &&
    typeof value.argument.value === "number" &&
    value.argument.value !== 0
  ) {
    return `-${value.argument.value}`;
  }
  return null;
}

const rule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: {
      description:
        "Enforce space/radii tokens from @/lib/theme instead of raw pixel values",
    },
    messages: {
      spacing:
        "Use a `space` token from @/lib/theme instead of the raw value `{{value}}` for `{{prop}}`.",
      radius:
        "Use a `radii` token from @/lib/theme instead of the raw value `{{value}}` for `{{prop}}`.",
    },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        const name = propName(node);
        if (!name) return;
        const messageId = SPACING_PROPS.has(name)
          ? "spacing"
          : RADIUS_PROPS.has(name)
            ? "radius"
            : null;
        if (!messageId) return;
        const raw = rawValue(node.value);
        if (raw === null) return;
        // Radii below 6px are sanctioned bespoke micro-corners (see the radius
        // scale comment in lib/theme/scales.ts) — the scale starts at xs=6.
        if (messageId === "radius" && Math.abs(parseFloat(raw)) < 6) return;
        const numeric = parseFloat(raw);
        const negative = numeric < 0;
        const magnitude = Math.abs(numeric);
        const token =
          messageId === "radius"
            ? `radii[${JSON.stringify(nearestKey(RADII_TICKS, magnitude))}]`
            : `space[${JSON.stringify(nearestKey(SPACE_TICKS, magnitude))}]`;
        const replacement = negative ? `\`-\${${token}}\`` : token;
        context.report({
          node: node.value,
          messageId,
          data: { value: raw, prop: name },
          fix(fixer) {
            return fixer.replaceText(node.value, replacement);
          },
        });
      },
    };
  },
};

export const themeTokens = {
  rules: {
    "no-raw-scale-values": rule,
  },
};

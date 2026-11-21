# Circadium Design System — Audit Report

A survey of the current design theme setup so you can spot gaps. Everything below is read straight from `lib/theme/` and `components/ui/`. Section 9 (Gaps) is the "what's missing" payload.

---

## 1. Architecture at a glance

The system is four layers, deliberately separated so theme-swappable values never mix with fixed numerics:

| Layer | File | What it holds |
| --- | --- | --- |
| **Vars** (theme-swappable) | `tokens.css.ts` + `themes.css.ts` | The CSS-custom-property contract, with two value sets (`themeLight`, `themeDark`). ~38 token leaves. |
| **Scales** (theme-independent) | `scales.ts` | Numerics that never change between themes: space, radii, contentWidth, breakpoints/media, borderWidth, zIndex. |
| **Recipes** (component shapes) | `recipes.css.ts` | 8 pre-built component styles: glass, popover, pillBtn, iconBtn, listRow, badge, formInput, progressTrack. |
| **Typography** (text presets) | `typography.css.ts` | display / text / caption / fieldLabel / statusTag presets. |

Plus supporting modules: `effects.ts` (backdrop-filter + color-mix presets), `transitions.ts` (motion), `fonts.ts` (font loading), `categoryColor.ts` (category color helpers), `sprinkles.css.ts` (atomic props API), `global.css.ts` (resets + scrollbars).

**Guiding principle:** prefer the higher-level surface (recipes → typography presets → sprinkles) over reaching for raw tokens. Everything routes through `@/lib/theme`.

**Rough size:** 2 themes · 2 fonts · ~38 themed tokens · 22 space steps · 13 radii · 17 type presets · 8 recipes · 10 z-index tiers · ~35 shared component primitives.

---

## 2. Color

Every color is a token with a light AND dark value. There are **no hardcoded colors** in components — they all reference `vars`.

### Surface + text (flat)

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `paper` | `#f2efea` | `#12141a` | Main canvas fill (warm off-white / near-black) |
| `bezel` | `#c8bfb6` | `#06080b` | Outer frame around the canvas |
| `ink` | `#16142a` | `#e6e8ec` | Primary text (violet-biased near-black) |
| `inkSoft` | `#3c3a52` | `rgba(230,232,236,0.65)` | Secondary text |
| `muted` | `#7a7890` | `rgba(230,232,236,0.42)` | Tertiary / placeholder |
| `rule` | `rgba(22,20,42,0.12)` | `rgba(230,232,236,0.10)` | Hairline dividers |
| `textOnAccent` | `#ffffff` | `#ffffff` | Text on accent fills |
| `overlay` | `rgba(10,8,20,0.22)` | `rgba(0,0,0,0.55)` | Modal scrim |
| `tileFill` | `#f2efea` | `#1c1f27` | Calendar tile base |

### Glass fills

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `glass.bg` | `rgba(255,255,255,0.28)` | `rgba(230,232,236,0.05)` | Default frosted panel |
| `glass.bgDeep` | `rgba(255,255,255,0.65)` | `rgba(230,232,236,0.09)` | Popovers / stronger panels |
| `glass.bgSoft` | `rgba(255,255,255,0.16)` | `rgba(230,232,236,0.025)` | Faint panels / neutral badge |
| `glass.stroke` | `rgba(22,20,42,0.14)` | `rgba(230,232,236,0.16)` | Panel borders |
| `glass.hi` | `rgba(255,255,255,0.55)` | `rgba(230,232,236,0.20)` | Inset top highlight |

### Interactive (row/button states)

| Token | Light | Dark | Note |
| --- | --- | --- | --- |
| `interactive.hoverFill` | `rgba(22,20,42,0.07)` | `rgba(230,232,236,0.07)` | Hover — **inverts direction per theme** (darkens light paper, brightens dark paper) |
| `interactive.selectedFill` | `rgba(22,20,42,0.12)` | `rgba(230,232,236,0.12)` | Persistent selected/active row |

> Use these for row hovers, **not** `glass.bgSoft`. This is the one nuance people get wrong.

### Elevation (shadow)

| Token | Note |
| --- | --- |
| `shadow.panel` | Full floating-panel elevation (drop shadow + inset top highlight) |
| `shadow.panelSm` | Lighter elevation for smaller surfaces |

Only **two** elevation steps exist (see Gaps §9).

### Accent

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `accent.primary` | `#3b82f6` | `#60a5fa` | Brand blue — focus, primary CTA |
| `accent.now` | `#6366f1` | `#818cf8` | "Now" indigo |
| `accent.done` | `#8b5cf6` | `#a78bfa` | "Done" violet |
| `accent.secondary` | `#6366f1` | `#818cf8` | Indigo secondary |

> Note: all four accents sit in the **blue → violet arc**. There is no warm/complementary accent (see §9).

### Status (semantic)

| Token | Light | Dark |
| --- | --- | --- |
| `status.success` | `#22c55e` | `#34d399` |
| `status.warning` | `#f59e0b` | `#fbbf24` |
| `status.error` | `#ef4444` | `#f87171` |
| `status.info` | `#3b82f6` | `#60a5fa` |

### Swatches (category palette)

8 named category colors — `blue green violet indigo cyan amber rose teal` — each with a light and dark value. Categories can also carry an arbitrary hex (via the color picker); the swatches are just the curated defaults.

| Light | `#3b82f6` `#22c55e` `#8b5cf6` `#6366f1` `#06b6d4` `#f59e0b` `#f43f5e` `#14b8a6` |
| --- | --- |
| **Dark** | `#60a5fa` `#34d399` `#a78bfa` `#818cf8` `#22d3ee` `#fbbf24` `#fb7185` `#2dd4bf` |

### Noise overlay tokens

`noise.opacity` (0.18 light / 0.22 dark) and `noise.blend` (`overlay` light / `soft-light` dark) — drive the grain layer.

### Category color helpers (`categoryColor.ts`)

- `categoryColor(category, theme)` — resolves a color or falls back (`#3b82f6` / `#60a5fa`).
- `categoryGlow(color)` — `0 0 8px {color}88` box-shadow.
- `categoryGradient(color)` — `linear-gradient(90deg, {color}, {color}cc)`.
- `categoryTint(color, alpha)` — hex → `rgba()` with alpha.

---

## 3. Typography

### Fonts (`fonts.ts`, loaded via `next/font/local`)

| Role | Family | Weights bundled | Var |
| --- | --- | --- | --- |
| **Display** | Clash Display | 200, 300, 400, 500, 600, 700 | `--app-font-display` → `vars.font.display` |
| **UI / body** | Hubot Sans | 400, 500, 600, 700 | `--app-font-ui` → `vars.font.ui` |

Both fall back to `system-ui, sans-serif`.

### Display presets (Clash Display, weight 500, `tnum` on)

| Preset | Size | Letter-spacing |
| --- | --- | --- |
| `display.hero` | 56 | -0.045em |
| `display.bigStat` | 44 | -0.045em |
| `display.pageTitle` | 32 | -0.03em |
| `display.statCard` | 26 | -0.04em |
| `display.modalTitle` | 22 | -0.02em |
| `display.sectionHead` | 20 | -0.02em |
| `display.panelTitle` | 18 | -0.02em |
| `display.listTitle` | 16 | -0.02em |

### Text presets (Hubot Sans)

| Preset | Size | Weight |
| --- | --- | --- |
| `text.bodyLg` | 14 | 500 |
| `text.body` | 13 | 500 |
| `text.bodySm` | 12.5 | 500 |
| `text.row` | 13 | 500 |
| `text.label` | 11.5 | 500 |
| `text.microLabel` | 11 | 500 |

### Utility label presets

| Preset | Size | Treatment |
| --- | --- | --- |
| `caption` | 10.5 | uppercase, 700, 0.10em tracking, inkSoft @ 0.85 |
| `fieldLabel` | 9.5 | uppercase, 600, 0.14em tracking, muted |
| `statusTag` | 9.5 | uppercase, 700, 0.06em tracking |

> **Note:** presets set family + size + weight + tracking, but **not line-height**. Multi-line body relies on the browser default (see §9).

---

## 4. Spacing & numeric scales (`scales.ts`)

### Space (22 steps, px)

`none 0 · px 1 · 0.5→2 · 1→4 · 1.5→6 · 2→8 · 2.5→10 · 3→12 · 3.5→14 · 4→16 · 5→20 · 6→24 · 7→28 · 8→32 · 10→40 · 12→48 · 14→56 · 16→64 · 20→80 · 21→88 · 22→96 · 23→104`

### Radii (13 tiers, px)

Base tiers: `xs 6 · sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · 3xl 30 · pill 999`
Half-steps (for glass/popover, intentionally rounder): `sm+2 10 · md+2 14 · lg+2 18 · xl+2 22`
Values below 6px stay hardcoded as bespoke micro-corners.

### Content width

`xs 520 · sm 640 · md 820 · lg 960 · xl 1240 · 2xl 1280` — text measures + page containers.

### Border width

`hairline 1` (app default, 85+ uses) · `medium 2` (accent underlines, focus rings) · `thick 3` (editable-title border).

### Breakpoints + media

`mobile 767 · tablet 1023 · laptop 1279`. Prebuilt media strings: `mobile, tablet, laptop, tabletUp, desktopUp, wideUp`. `laptop` is where a docked wide side panel stops fitting → switches to overlay. Rail+content grids collapse at `tablet`, not `mobile`.

### Z-index (10 semantic tiers)

`base 0 · docked 5 · raised 10 · floating 30 · palette 50 · popoverOverPalette 60 · modal 100 · modalOver 150 · toast 200 · appLoading 300`.

> `toast 200` is **reserved but unimplemented** (see §9).

---

## 5. Glass & background system

This is the signature of the app. It's a **layered stack**, not a single effect.

### The frame (from `AppShell.css.ts`)

```
bezelFrame   → background: vars.bezel, padding: 6px (space 1.5), full viewport
  └ canvas   → background: vars.paper, borderRadius: 30 (3xl), isolation: isolate, overflow: hidden
       ├ Backdrop  (blob / pinstripe)   ← absolute, z 0, pointer-events none
       ├ Grain     (noise overlay)      ← absolute, z 0
       └ contentRow (z 1)               ← sidebar + main column
```

On mobile: bezel padding → 0, canvas corners → square.

### Backdrop (`Backdrop.tsx` + `.css.ts`)

Four variants: `blob` (default), `pinstripe`, `both`, `none`. Both light and dark variants are rendered simultaneously and **cross-faded via opacity** (background-image gradients don't interpolate reliably across browsers, so a straight theme swap would snap).

- **blob** — single 135° corner-to-corner linear gradient (`rgba(255,255,255,0.55)` light / `rgba(60,64,72,0.45)` dark). Deliberately a linear ramp, not radial peaks, to avoid a "black blob on white" flash mid-theme-transition.
- **pinstripe** — 45° repeating hairline stripes (`rgba(22,20,42,0.055)` light / `rgba(255,255,255,0.05)` dark), 9px transparent + 1px line.

### Grain (`Grain.tsx` + `.css.ts`)

An inline SVG `feTurbulence` fractal-noise data-URI, `opacity: vars.noise.opacity`, `mixBlendMode: vars.noise.blend`. Absolute, full-cover, pointer-events none.

### The `glass` recipe (`recipes.css.ts`)

The canonical panel. Base: 1px `glass.stroke` border + `shadow.panel` + `glass.bg` + theme transition. Variants:

| Variant | Options |
| --- | --- |
| `fill` | `regular` (bg) · `deep` (bgDeep) · `soft` (bgSoft) |
| `radius` | `sm 16` · `md 18` · `lg 22` · `xl 24` · `canvas 30` |
| `shadow` | `panel` · `panelSm` · `none` |
| `blur` | `self` (backdrop-filter on element — default) · `pseudo` (blur on ::before, for nested-glass so a parent filter doesn't block a child's backdrop sample) · `none` |

The `self` vs `pseudo` blur distinction is the sophisticated bit: a parent `backdrop-filter` establishes a backdrop root that blocks descendant filters, so a glass card containing a pinned glass header uses `pseudo`.

Consumed via the `<Glass>` component (`fill`/`radius`/`shadow` props).

### The `popover` recipe

Canonical floating surface (dropdowns, menus, modals). `glass.bgDeep` + `panel` blur + stroke + transition. Size variants `sm / md / lg / xl` bundle radius + shadow.

### Backdrop-filter presets (`effects.ts`)

| Preset | Value |
| --- | --- |
| `panel` | `blur(28px) saturate(180%)` |
| `button` | `blur(12px) saturate(140%)` |
| `event` | `blur(12px) saturate(160%)` |
| `scrollbar` | `blur(14px) saturate(160%)` |
| `palette` | `blur(8px)` |
| `modal` | `blur(4px)` |
| `confirm` | `blur(2px)` |

### color-mix alpha stops (`effects.ts`)

Named opacity percentages for `color-mix(in srgb, X N%, transparent)`: `subtleFill 10 · lightFill 14 · hoverFill 22 · selectedFill 28 · alertFill 78 · denseFill 94`.

### Scrollbars (`global.css.ts`)

Custom themed scrollbars: 7px, glass.bgDeep thumb with stroke + inset highlight + `scrollbar` backdrop-blur, pill radius, transparent end-cap spacer buttons so the thumb never abuts the track edges.

---

## 6. Motion (`transitions.ts`)

Durations (seconds), single-sourced:

| Name | Value | Use |
| --- | --- | --- |
| `theme` | 0.3 | Light/dark color/border/shadow swaps |
| `buttonState` | 1 | Button hover color shifts |
| `press` | 0.12 | `:active` scale feedback |
| `interactive` | 0.12 | Popover/picker hover swaps |
| `interactive2` | 0.14 | Switches / some inputs (better ease) |
| `collapse` | 0.22 | Sidebar collapse, panel slide-in |
| `modal` | 0.18 | Dialog/sheet entrance |
| `progress` | 0.25 | Progress-bar width fills |

Composed transition strings: `themeTransition` (bg/color/border/shadow/fill/stroke), `buttonTransition` (+ transform press), `collapseTransition` (width/max-width/opacity/padding/gap/transform), `progressTransition`, and `interactiveTransition(...)` / `interactive2Transition(...)` factory helpers.

---

## 7. Recipes (the 8 component shapes)

| Recipe | Variants | Backs |
| --- | --- | --- |
| `glass` | fill · radius · shadow · blur | `<Glass>`, every panel |
| `popover` | size (sm/md/lg/xl) | Every floating surface |
| `pillBtn` | variant (8) · size (sm/md/lg) | `<Button>` |
| `iconBtn` | size (sm 22 / md 26) | Icon buttons (className, no wrapper) |
| `listRow` | selected | Interactive list rows (className) |
| `badge` | tone (8) · size (sm/md) | `<TypeBadge>`, `<StatusTag>`, `<CategoryBadge>` |
| `formInput` | variant (4) | `<Input>` |
| `progressTrack` | size (sm/md/lg) | `<ProgressBar>` |

**`pillBtn` variants:** `glass` · `glassInk` (primary) · `solid` (ink) · `solidLight` (paper) · `ghost` · `outlined` · `danger`. Sizes: sm (5×12, 12px) · md (6×14, 12.5px) · lg (8×18, 14px).

**`badge` tones:** `type` (ink) · `now` · `done` · `success` · `warning` · `error` · `info` · `neutral`. All uppercase, 700, pill.

**`formInput` variants:** `boxed` (default labeled field) · `underline` (command-bar modals like Capture) · `bare` (embedded in a styled wrapper) · `titleInline` (inline rename, accent underline only, borrows caller's display typography).

---

## 8. Component inventory (`components/ui/`)

~35 shared primitives, exported from `components/ui/index.ts`. Grouped:

**Surfaces & structure**
`Glass` · `Backdrop` · `Grain` · `Masthead` · `StubPage` · `AppShell` · `Sidebar` · `MobileTabs` · `BottomSheet` (Radix dialog) · `ConfirmModal` (Radix alert-dialog)

**Overlays & palettes**
`CapturePalette` · `SearchPalette` (Radix dialog) · `CornerActions` · `AppLoadingScreen`

**Buttons**
`Button` (pillBtn, 8 variants × 3 sizes) · `iconBtn` (recipe, used via className)

**Form controls**
`Input` (4 variants) · `Field` · `FieldStack` / `FieldValue` · `Combobox` (Radix popover — the dropdown/select) · `Switch` (Radix switch — the ONLY boolean control) · `SegmentedControl` (single-select pill group with sliding thumb) · `DateTimePicker` · `TimePicker` · `DurationField`

**Badges & indicators**
`TypeBadge` · `StatusTag` · `CategoryBadge` · `CategoryDot` · `ConicDot` · `Caption` · `Kbd` · `listRow` (recipe)

**Feedback**
`Loader` · `CenteredLoader` · `ProgressBar`

**Brand & theme**
`Logo` · `ThemeProvider` / `useTheme` · `useResolvedCategoryColor`

**Radix primitives actually in use:** `dialog`, `popover`, `switch`, `alert-dialog`. That's it — no checkbox, radio, tabs, tooltip, slider, dropdown-menu, select, accordion, or toggle-group from Radix.

---

## 9. Gaps & what might be missing

The investigation payload. Severity: **Missing** (no primitive at all) · **Ad-hoc** (exists but hand-rolled per site, no shared component) · **Partial** (partially covered) · **Minor/Note** (deliberate or low-impact).

| # | Item | Severity | Finding |
| --- | --- | --- | --- |
| 1 | **Checkbox / Radio** | Missing | No checkbox or radio primitive. Boolean input is served **only** by `Switch`. Any multi-select opt-in list or radio choice has to hand-roll it. You mentioned checkboxes specifically — this is the clearest gap. |
| 2 | **Textarea** | Ad-hoc | `Input` wraps `<input>` only. Multi-line entry (the AI chat composer in `ChatPane`) hand-rolls a raw `<textarea>` with local styles. No `formInput` multiline variant. |
| 3 | **Dialog / Modal shell** | Partial | No shared `Dialog` primitive. **12+ sites** import `@radix-ui/react-dialog` directly and re-style the overlay + panel each time (WeekStructureModal, NewPlanModal, all three location modals, AIDraftModal, CalendarPopover, AddMemberModal, CategoryExceptionsModal…). Only `ConfirmModal` (alert) and `BottomSheet` are wrapped. A shared modal shell over the `popover` recipe + `overlay` token would kill a lot of duplication. |
| 4 | **Menu / DropdownMenu** | Ad-hoc | Row action menus use raw Radix `Popover` + hand-built option buttons (`ItemRow`, `BulkActionBar`, `DependencyGatePopover`, `MarkerMenu`, `ChatHistoryPopover`). `Combobox` is close but it's a value-select, not an action menu. |
| 5 | **Tabs** | Ad-hoc | Tabbed surfaces (item detail `ItemTabs`, the draft review pane) build `role="tab"` buttons by hand. `SegmentedControl` looks similar but is a single-select control, not a tab-panel primitive. |
| 6 | **Tooltip** | Missing | No tooltip primitive. The graph's hover detail badge is bespoke; elsewhere native `title` attributes are used. No themed, positioned tooltip. |
| 7 | **Slider** | Ad-hoc | The graph zoom uses a bespoke `<input type="range">`. No themed `Slider`. |
| 8 | **Toast / notifications** | Missing (planned) | `zIndex.toast` (200) is reserved but **no toast surface exists**. Post-action feedback is silent or inline. |
| 9 | **Focus ring** | Gap | No single focus-ring token. Focus is per-recipe (e.g. input border → accent). Keyboard-focus visibility is inconsistent across custom buttons and rows. A shared `:focus-visible` outline token would tighten a11y. |
| 10 | **Type line-height** | Minor | `display` / `text` presets set size + weight + tracking but **not line-height**. Multi-line body inherits the browser default (~1.2), so long paragraphs run tight. A tokenized reading line-height (~1.5) is absent. |
| 11 | **Elevation ramp** | Minor | Only two shadows (`panel`, `panelSm`). No distinct raised-vs-modal-vs-toast elevation steps — everything floating shares one shadow. |
| 12 | **Accent range** | Note | All four accents (`primary/now/done/secondary`) sit in the blue→violet arc. No warm/complementary accent; semantic status color carries all non-cool signaling. Intentional, but it limits the emphasis vocabulary. |
| 13 | **Empty / skeleton states** | Missing | `Loader` / `CenteredLoader` exist, but no skeleton-placeholder primitive or standardized empty-state component. |

### What's genuinely strong (so you don't "fix" it)

- **Fully dual-theme token contract** — zero hardcoded colors; every value has a light + dark pair.
- **Recipes lock call-site drift** — panels/buttons/inputs/badges can't diverge because their shape is a single recipe.
- **Single-sourced numeric scales** — space/radii/z-index/breakpoints all come from one file.
- **`hoverFill` per-theme inversion** and the **`self` vs `pseudo` glass-blur** distinction are subtle, correct calls most systems get wrong.
- **Cross-faded backdrop layers** to survive theme transitions cleanly.

### Suggested priority if you act on it

1. **Checkbox + RadioGroup** primitive (§1) — smallest, most obviously missing.
2. **Shared Dialog/Modal shell** (§3) — biggest duplication win.
3. **Textarea / `formInput` multiline** (§2) and **Tabs** (§5) — both already hand-rolled in 2+ places.
4. **Focus-ring token** (§9) — cheap a11y hardening.
5. Toast (§8), Tooltip (§6), Slider (§7) as the app surfaces them.

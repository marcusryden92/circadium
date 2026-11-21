"use client";

import { useIsMobile } from "@/hooks/useIsMobile";
import { space } from "@/lib/theme/scales";
import { SegmentedControl, type SegmentedOption } from "../SegmentedControl";
import { Combobox } from "../Combobox";

// SegmentedControl on desktop; on mobile, where a row of segments eats too much
// horizontal space, it collapses to a Combobox dropdown showing just the active
// option. The same options carry over (key -> value), so callers swap one for
// the other without reshaping their data.
export function ResponsiveSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Combobox<T>
        value={value}
        options={options.map((o) => ({ value: o.key, label: o.label }))}
        onChange={onChange}
        ariaLabel={ariaLabel}
        renderValue={(opt) => (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: space["1.5"],
            }}
          >
            {opt?.label}
          </span>
        )}
      />
    );
  }

  return (
    <SegmentedControl options={options} value={value} onChange={onChange} />
  );
}

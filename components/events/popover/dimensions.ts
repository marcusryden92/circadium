// Shared width for every calendar popover so the set reads as one system.
// Height stays per-type (passed to CalendarPopover) because it feeds
// usePopoverPosition's flip-above/below estimate — a read-only popover is
// genuinely shorter than the editable Event one.
export const POPOVER_WIDTH = 340;

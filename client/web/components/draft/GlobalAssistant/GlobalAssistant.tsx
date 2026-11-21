"use client";

import { usePathname } from "next/navigation";
import { useAssistant } from "@/components/ui/shell/AssistantContext";
import { useShellOverlay } from "@/components/ui/shell/ShellOverlayContext";
import { useCalendarProvider } from "@/context/CalendarProvider";
import { getRootParentId } from "@/utils/goalPageHandlers";
import { AIDraftModal, type AIDraftFocus } from "@/components/draft/AIDraftModal";

// Thin shell-level wrapper: resolves what the assistant should focus on
// (an explicit scope from the opener wins; otherwise the /items/[id] route
// is detected) and mounts the modal into the AppShell assistant slot.
export function GlobalAssistant() {
  const { open, scope, close } = useAssistant();
  useShellOverlay(open);
  const pathname = usePathname();
  const { planner } = useCalendarProvider();

  const routeItemId = pathname?.match(/^\/items\/([^/]+)/)?.[1] ?? null;
  const focusItemId = scope?.focusItemId ?? routeItemId;
  const rootId = focusItemId
    ? getRootParentId(planner, focusItemId) ?? null
    : null;
  const focus: AIDraftFocus | null = rootId
    ? { rootId, itemId: focusItemId }
    : null;

  return (
    <AIDraftModal
      open={open}
      onClose={close}
      focus={focus}
      initialPrompt={scope?.initialPrompt ?? null}
      intent={scope?.intent ?? null}
    />
  );
}

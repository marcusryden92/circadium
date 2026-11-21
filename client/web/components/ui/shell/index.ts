export { AppShell } from "./AppShell";
export { Sidebar } from "./Sidebar";
export { MobileTabs } from "./MobileTabs";
export { CapturePalette } from "./CapturePalette";
export { CaptureProvider, useCapture } from "./CaptureContext";
export { AssistantProvider, useAssistant } from "./AssistantContext";
export type { AssistantScope } from "./AssistantContext";
export { AiAccessProvider, useAiAccess } from "./AiAccessContext";
export type { AiAccessStatus, SaveKeyResult } from "./AiAccessContext";
export { SearchPalette } from "./SearchPalette";
export { SearchProvider, useSearch } from "./SearchContext";
export {
  ShellOverlayProvider,
  useShellOverlay,
  useShellOverlayOpen,
} from "./ShellOverlayContext";
export { ShellPortalProvider, useShellPortalTarget } from "./ShellPortalContext";
export { NavHistoryProvider, usePreviousPathname } from "./NavHistoryContext";
export { NAV_ITEMS, MOBILE_TABS, isCanvasRoute } from "./nav";
export type { NavItem } from "./nav";

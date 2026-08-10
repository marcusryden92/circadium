import {
  Home,
  Calendar,
  Plus,
  Library,
  Layers,
  ListOrdered,
  Waypoints,
  Orbit,
  MapPin,
  Repeat,
  GraduationCap,
  MessageSquare,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string | null;
  kind: "route";
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: Home,
    href: "/dashboard",
    kind: "route",
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: Calendar,
    href: "/calendar",
    kind: "route",
  },
  {
    key: "capture",
    label: "Capture",
    icon: Plus,
    href: "/capture",
    kind: "route",
  },
  {
    key: "library",
    label: "Library",
    icon: Library,
    href: "/library",
    kind: "route",
  },
  {
    key: "habits",
    label: "Habits",
    icon: Repeat,
    href: "/habits",
    kind: "route",
  },
  {
    key: "categories",
    label: "Roles",
    icon: Layers,
    href: "/categories",
    kind: "route",
  },
  {
    key: "queues",
    label: "Queues",
    icon: ListOrdered,
    href: "/queues",
    kind: "route",
  },
  {
    key: "graph",
    label: "Graph",
    icon: Waypoints,
    href: "/graph",
    kind: "route",
  },
  {
    key: "mindmap",
    label: "Mindmap",
    icon: Orbit,
    href: "/mindmap",
    kind: "route",
  },
  {
    key: "locations",
    label: "Locations",
    icon: MapPin,
    href: "/locations",
    kind: "route",
  },
  {
    key: "tutorials",
    label: "Tutorials",
    icon: GraduationCap,
    href: "/tutorials",
    kind: "route",
  },
  {
    key: "feedback",
    label: "Feedback",
    icon: MessageSquare,
    href: "/feedback",
    kind: "route",
  },
];

// Full-bleed canvas surfaces. On mobile the shell hides its floating chrome
// here (tab bar, corner actions) and each page shows a back button instead,
// so the canvas keeps the vertical space.
const CANVAS_ROUTES = ["/graph", "/mindmap"];

export function isCanvasRoute(pathname: string): boolean {
  return CANVAS_ROUTES.some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

export type MobileTab = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string | null;
};

export const MOBILE_TABS: MobileTab[] = [
  { key: "dashboard", label: "Dashboard", icon: Home, href: "/dashboard" },
  { key: "library", label: "Library", icon: Library, href: "/library" },
  { key: "capture", label: "Capture", icon: Plus, href: null },
  { key: "calendar", label: "Calendar", icon: Calendar, href: "/calendar" },
  { key: "more", label: "More", icon: MoreHorizontal, href: null },
];

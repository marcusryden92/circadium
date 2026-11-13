"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import {
  ChevronLeft,
  LogOut,
  Moon,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { useTheme } from "../../ThemeProvider";
import { Logo } from "../../Logo";
import { useAssistant } from "../AssistantContext";
import { NAV_ITEMS } from "../nav";
import {
  sidebar,
  brand,
  navItem,
  navItemActive,
  navGlyph,
  navLabel,
  spacer,
  navDivider,
  footerRow,
  avatar,
  footerText,
  footerName,
  collapseChevronIcon,
  userMenu,
  userMenuItem,
  userMenuItemDanger,
  userMenuIcon,
} from "./Sidebar.css";

const COLLAPSE_KEY = "circadium.sidebar.collapsed";

type Props = {
  userName?: string;
  userInitial?: string;
};

export function Sidebar({ userName = "User", userInitial = "U" }: Props) {
  const pathname = usePathname() ?? "";
  const { dark, toggle } = useTheme();
  const { openAssistant } = useAssistant();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // localStorage may be unavailable (private mode, disabled cookies)
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage may be unavailable (private mode, quota exceeded)
    }
  }, [collapsed, hydrated]);

  return (
    <aside
      className={sidebar}
      data-collapsed={collapsed}
      aria-label="Main navigation"
    >
      <div className={brand} title="Circadium">
        <Logo size={30} collapsed={collapsed} />
      </div>

      <div className={navDivider} aria-hidden />

      {NAV_ITEMS.map((item, i) => {
        const isActive = item.href
          ? pathname === item.href || pathname.startsWith(`${item.href}/`)
          : false;
        const className = `${navItem} ${isActive ? navItemActive : ""}`;
        const Icon = item.icon;

        return (
          <Link
            key={item.key}
            href={item.href ?? "#"}
            className={className}
            title={item.label}
            style={{ marginTop: i === 0 ? "8px" : "" }}
          >
            <span className={navGlyph}>
              <Icon size={16} strokeWidth={2} aria-hidden />
            </span>
            <span className={navLabel}>{item.label}</span>
          </Link>
        );
      })}

      <div className={spacer} />

      <button
        type="button"
        className={navItem}
        onClick={() => openAssistant()}
        title="AI assistant (Ctrl/Cmd+I)"
      >
        <span className={navGlyph}>
          <Sparkles size={16} strokeWidth={2} aria-hidden />
        </span>
        <span className={navLabel}>Assistant</span>
      </button>

      <div className={navDivider} aria-hidden />

      <button
        type="button"
        className={navItem}
        onClick={toggle}
        title={dark ? "Light mode" : "Dark mode"}
      >
        <span className={navGlyph}>
          {dark ? (
            <Sun size={16} strokeWidth={2} aria-hidden />
          ) : (
            <Moon size={16} strokeWidth={2} aria-hidden />
          )}
        </span>
        <span className={navLabel}>{dark ? "Light mode" : "Dark mode"}</span>
      </button>

      <button
        type="button"
        className={navItem}
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
      >
        <span className={navGlyph}>
          <span className={collapseChevronIcon} aria-hidden>
            <ChevronLeft size={16} strokeWidth={2} />
          </span>
        </span>
        <span className={navLabel}>Collapse</span>
      </button>

      <UserMenu userName={userName} userInitial={userInitial} />
    </aside>
  );
}

function UserMenu({
  userName,
  userInitial,
}: {
  userName: string;
  userInitial: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [portalReady, setPortalReady] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPortalReady(true), []);

  // Anchor at the trigger's top-left + a horizontal offset past the avatar.
  // The menu's own CSS transform shifts it up by its height so it ends up
  // diagonally overlapping the footer button from above.
  useLayoutEffect(() => {
    if (!open) return;
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuPos({ top: rect.top, left: rect.left + 28 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDocPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={footerRow}
        onClick={() => setOpen((o) => !o)}
        title="Account menu"
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className={avatar} aria-hidden>
          {userInitial}
        </div>
        <div className={footerText}>
          <div className={footerName}>{userName}</div>
        </div>
      </button>
      {open &&
        portalReady &&
        createPortal(
          <div
            ref={menuRef}
            className={userMenu}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <Link
              href="/settings"
              className={userMenuItem}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span className={userMenuIcon}>
                <Settings size={14} strokeWidth={2} aria-hidden />
              </span>
              Settings
            </Link>
            <button
              type="button"
              className={`${userMenuItem} ${userMenuItemDanger}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              <span className={userMenuIcon}>
                <LogOut size={14} strokeWidth={2} aria-hidden />
              </span>
              Sign out
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

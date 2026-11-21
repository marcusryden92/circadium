"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  tabsStrip,
  tab,
  tabActive,
  tabCount,
  tabDisabled,
} from "./ItemTabs.css";

interface Tab {
  key: string;
  label: string;
  href: string;
  count?: number;
  disabled?: boolean;
}

interface ItemTabsProps {
  itemId: string;
  subtaskCount: number;
  subtasksEnabled: boolean;
}

export function ItemTabs({
  itemId,
  subtaskCount,
  subtasksEnabled,
}: ItemTabsProps) {
  const pathname = usePathname();
  const base = `/items/${itemId}`;

  const tabs: Tab[] = [
    { key: "overview", label: "Overview", href: base },
    {
      key: "subtasks",
      label: "Subtasks",
      href: `${base}/subtasks`,
      count: subtaskCount,
      disabled: !subtasksEnabled,
    },
    { key: "schedule", label: "Schedule", href: `${base}/schedule` },
    { key: "alerts", label: "Alerts", href: `${base}/alerts` },
  ];

  return (
    <div className={tabsStrip} role="tablist">
      {tabs.map((t) => {
        const isActive =
          t.href === base
            ? pathname === base || pathname === `${base}/`
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
        const className = `${tab} ${isActive ? tabActive : ""} ${
          t.disabled ? tabDisabled : ""
        }`;
        if (t.disabled) {
          return (
            <span
              key={t.key}
              role="tab"
              aria-selected={false}
              aria-disabled
              className={className}
            >
              <span>{t.label}</span>
              {typeof t.count === "number" && (
                <span className={tabCount}>{t.count}</span>
              )}
            </span>
          );
        }
        return (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={isActive}
            className={className}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <span className={tabCount}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

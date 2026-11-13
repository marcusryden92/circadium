"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  AlertTriangle,
  Bell,
  Box,
  Calendar,
  Lock,
  LogOut,
  Plug,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import type { UserRole } from "@/generated/client";
import { ProfileSection } from "./ProfileSection";
import { AccountSection } from "./AccountSection";
import { SchedulingSection } from "./SchedulingSection";
import { AISection } from "./AISection";
import { IntegrationsSection } from "./IntegrationsSection";
import { DataSection } from "./DataSection";
import { ComingSoonSection } from "./ComingSoonSection";
import { DangerSection } from "./DangerSection";
import {
  page,
  spacer,
  userBadge,
  mainGrid,
  subnav,
  subnavItem,
  subnavItemActive,
  subnavItemDanger,
  subnavIcon,
  content,
  scrollWrap,
  pinstripeRule,
  sectionHead,
  sectionTitle,
  sectionSub,
} from "../page.css";

type SectionId =
  | "profile"
  | "account"
  | "scheduling"
  | "ai"
  | "notifications"
  | "integrations"
  | "data"
  | "danger";

const SECTIONS: {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
}[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Lock },
  { id: "scheduling", label: "Scheduling", icon: Calendar },
  { id: "ai", label: "AI assistant", icon: Sparkles },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "data", label: "Data & export", icon: Box },
  { id: "danger", label: "Danger zone", icon: AlertTriangle, danger: true },
];

const SECTION_META: Record<SectionId, { title: string; sub: string }> = {
  profile: { title: "Profile", sub: "name" },
  account: {
    title: "Account",
    sub: "email · password · two-factor · linked sign-ins",
  },
  scheduling: {
    title: "Scheduling",
    sub: "transport mode · week start · travel events · travel times",
  },
  ai: {
    title: "AI assistant",
    sub: "your own API key · stored on this device",
  },
  notifications: { title: "Notifications", sub: "alerts · email digests" },
  integrations: {
    title: "Integrations",
    sub: "connected calendars · ICS feeds",
  },
  data: { title: "Data & export", sub: "download · import · privacy" },
  danger: { title: "Danger zone", sub: "irreversible account actions" },
};

const COMING_SOON_COPY: Record<
  "notifications",
  { title: string; body: string }
> = {
  notifications: {
    title: "Notifications",
    body: "Email digests and engine alerts are coming soon. They'll let you know when the engine couldn't place something important, or summarize what's slipping this week.",
  },
};

interface SettingsUser {
  name?: string;
  email?: string;
  role: UserRole;
  isTwoFactorEnabled: boolean;
  isOAuth?: boolean;
}

export function SettingsView({ user }: { user: SettingsUser }) {
  const [section, setSection] = useState<SectionId>("profile");

  return (
    <div className={page}>
      <PageHeader title="Settings" summary="account · scheduling · workspace">
        <span className={spacer} />
        <span className={userBadge}>
          {user.name || user.email || "Signed in"}
        </span>
        <Button variant="glass" size="sm" onClick={() => signOut()}>
          <LogOut size={12} strokeWidth={2.2} />
          Sign out
        </Button>
      </PageHeader>

      <div className={mainGrid}>
        <nav className={subnav} aria-label="Settings sections">
          {SECTIONS.map(({ id, label, icon: Icon, danger }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                className={`${subnavItem} ${active ? subnavItemActive : ""} ${
                  !active && danger ? subnavItemDanger : ""
                }`}
                onClick={() => setSection(id)}
              >
                <span className={subnavIcon}>
                  <Icon size={14} strokeWidth={2} />
                </span>
                {label}
              </button>
            );
          })}
        </nav>

        <div className={content}>
          <div className={sectionHead}>
            <h2 className={sectionTitle}>{SECTION_META[section].title}</h2>
            <span className={sectionSub}>{SECTION_META[section].sub}</span>
          </div>
          <div className={pinstripeRule} aria-hidden />
          <div className={scrollWrap}>
            {section === "profile" && <ProfileSection user={user} />}
            {section === "account" && <AccountSection user={user} />}
            {section === "scheduling" && <SchedulingSection />}
            {section === "ai" && <AISection />}
            {section === "notifications" && (
              <ComingSoonSection {...COMING_SOON_COPY.notifications} />
            )}
            {section === "integrations" && <IntegrationsSection />}
            {section === "data" && <DataSection />}
            {section === "danger" && <DangerSection user={user} />}
          </div>
          <div className={pinstripeRule} aria-hidden />
        </div>
      </div>
    </div>
  );
}

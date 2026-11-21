"use client";

import { useState } from "react";
import {
  Backdrop,
  Glass,
  Caption,
  Button,
  TypeBadge,
  CategoryBadge,
  CategoryDot,
  ConicDot,
  Grain,
  Masthead,
  ProgressBar,
  StatusTag,
  useTheme,
  display,
  text,
  sprinkles,
  vars,
} from "@/components/ui";

type BackdropVariant = "pinstripe" | "none";

const SWATCHES = [
  { name: "blue", color: "#3b82f6" },
  { name: "green", color: "#22c55e" },
  { name: "violet", color: "#8b5cf6" },
  { name: "indigo", color: "#6366f1" },
  { name: "cyan", color: "#06b6d4" },
  { name: "amber", color: "#f59e0b" },
  { name: "rose", color: "#f43f5e" },
  { name: "teal", color: "#14b8a6" },
];

const BACKDROPS: BackdropVariant[] = ["pinstripe", "none"];

export default function TestTokensPage() {
  const { dark, toggle } = useTheme();
  const [backdrop, setBackdrop] = useState<BackdropVariant>("pinstripe");
  return (
    <div
      className={sprinkles({
        position: "relative",
        w: "100%",
        bg: "paper",
        overflow: "hidden",
      })}
      style={{
        minHeight: "100vh",
        color: vars.ink,
        fontFamily: vars.font.ui,
      }}
    >
      <Backdrop variant={backdrop} />
      <Grain />
      <div
        className={sprinkles({
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "6",
          p: "8",
        })}
        style={{ zIndex: 1, maxWidth: 1120, margin: "0 auto" }}
      >
        <Masthead>
          <Caption>Vol. 1 · Iss. 1 · token verification</Caption>
          <div style={{ flex: 1 }} />
          <Caption>⌘K capture · marcus</Caption>
        </Masthead>

        <header
          className={sprinkles({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "4",
          })}
        >
          <div>
            <h1 className={display.hero} style={{ margin: 0 }}>
              Theme foundation
            </h1>
            <Caption>tokens · primitives · {dark ? "dark" : "light"}</Caption>
          </div>
          <div className={sprinkles({ display: "flex", gap: "2", alignItems: "center" })}>
            {BACKDROPS.map((v) => (
              <Button
                key={v}
                variant={v === backdrop ? "solid" : "glass"}
                size="sm"
                onClick={() => setBackdrop(v)}
              >
                {v}
              </Button>
            ))}
            <Button variant="glass" onClick={toggle}>
              {dark ? "☀ Light" : "☾ Dark"}
            </Button>
          </div>
        </header>

        <Glass radius="lg" fill="regular">
          <div className={sprinkles({ p: "6", display: "flex", flexDirection: "column", gap: "4" })}>
            <Caption>Glass panel · regular</Caption>
            <h2 className={display.sectionHead} style={{ margin: 0 }}>
              Frosted surface
            </h2>
            <p className={text.body} style={{ color: vars.inkSoft, margin: 0 }}>
              Backdrop-filter blur with token-driven stroke, fill, shadow, and inset highlight.
              Toggle the theme to see all values swap.
            </p>
          </div>
        </Glass>

        <div
          className={sprinkles({
            display: "grid",
            gap: "4",
          })}
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          <Glass radius="md" fill="deep">
            <div className={sprinkles({ p: "5", display: "flex", flexDirection: "column", gap: "3" })}>
              <Caption>Buttons</Caption>
              <div className={sprinkles({ display: "flex", flexWrap: "wrap", gap: "2" })}>
                <Button variant="solid">Open calendar →</Button>
                <Button variant="glass">Full week →</Button>
                <Button variant="ghost">Skip</Button>
                <Button variant="danger" size="sm">
                  Delete
                </Button>
              </div>
            </div>
          </Glass>

          <Glass radius="md" fill="deep">
            <div className={sprinkles({ p: "5", display: "flex", flexDirection: "column", gap: "3" })}>
              <Caption>Badges &amp; tags</Caption>
              <div className={sprinkles({ display: "flex", flexWrap: "wrap", gap: "2", alignItems: "center" })}>
                <TypeBadge>GOAL</TypeBadge>
                <TypeBadge tone="now">NOW</TypeBadge>
                <TypeBadge tone="done">DONE</TypeBadge>
                <StatusTag tone="late">LATE</StatusTag>
                <StatusTag tone="overdue">OVERDUE</StatusTag>
                <StatusTag tone="fail">FAIL</StatusTag>
                <StatusTag tone="ok">OK</StatusTag>
              </div>
            </div>
          </Glass>

          <Glass radius="md" fill="deep">
            <div className={sprinkles({ p: "5", display: "flex", flexDirection: "column", gap: "3" })}>
              <Caption>AI / engine spark</Caption>
              <div className={sprinkles({ display: "flex", alignItems: "center", gap: "3" })}>
                <ConicDot size={14} />
                <span className={text.body}>✦ Plan with AI</span>
              </div>
            </div>
          </Glass>
        </div>

        <Glass radius="lg" fill="regular">
          <div className={sprinkles({ p: "6", display: "flex", flexDirection: "column", gap: "4" })}>
            <Caption>Category swatches · suggested picker palette</Caption>
            <div
              className={sprinkles({ display: "grid", gap: "3" })}
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
            >
              {SWATCHES.map((s) => (
                <div
                  key={s.name}
                  className={sprinkles({
                    display: "flex",
                    alignItems: "center",
                    gap: "2",
                    p: "3",
                    rounded: "md",
                  })}
                  style={{ border: `1px solid ${vars.rule}` }}
                >
                  <CategoryDot color={s.color} />
                  <CategoryBadge color={s.color}>{s.name}</CategoryBadge>
                </div>
              ))}
            </div>
          </div>
        </Glass>

        <Glass radius="lg" fill="regular">
          <div className={sprinkles({ p: "6", display: "flex", flexDirection: "column", gap: "4" })}>
            <Caption>Progress · 7 of 12 · 58%</Caption>
            <h2 className={display.statCard} style={{ margin: 0 }}>
              58%
            </h2>
            <ProgressBar value={58} color="#6366f1" ticks={[10, 25, 50, 75, 90]} />
          </div>
        </Glass>

        <div
          className={sprinkles({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pt: "4",
          })}
        >
          <Caption>type scale</Caption>
          <Caption>{dark ? "theme.dark" : "theme.light"}</Caption>
        </div>
        <Glass radius="md" fill="soft">
          <div className={sprinkles({ p: "6", display: "flex", flexDirection: "column", gap: "3" })}>
            <span className={display.hero}>Hero 56</span>
            <span className={display.bigStat}>Big stat 44</span>
            <span className={display.pageTitle}>Page title 32</span>
            <span className={display.statCard}>Stat card 26</span>
            <span className={display.sectionHead}>Section head 20</span>
            <span className={display.listTitle}>List title 16</span>
            <span className={text.bodyLg}>Body large 14 · Hubot Sans 500</span>
            <span className={text.body}>Body 13 · Hubot Sans 500</span>
            <span className={text.bodySm}>Body small 12.5 · Hubot Sans 500</span>
          </div>
        </Glass>
      </div>
    </div>
  );
}

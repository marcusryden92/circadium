"use client";

import { space } from "@/lib/theme";
import {
  AppShell,
  Glass,
  Caption,
  Button,
  Masthead,
  ProgressBar,
  ConicDot,
  display,
  text,
  sprinkles,
  vars,
} from "@/components/ui";

export default function TestShellContent() {
  return (
    <AppShell userName="Marcus" userInitial="M">
      <Masthead>
        <Caption>Vol. 2026 · Iss. 149 · wed apr 10</Caption>
        <div style={{ flex: 1 }} />
        <Caption>⌘K capture · marcus</Caption>
      </Masthead>

      <div
        className={sprinkles({
          display: "flex",
          flexDirection: "column",
          gap: "6",
          p: "8",
        })}
        style={{ maxWidth: 1120, width: "100%", margin: "0 auto" }}
      >
        <header>
          <Caption>good morning</Caption>
          <h1 className={display.hero} style={{ margin: 0, marginTop: space["1"] }}>
            Good morning, Marcus
          </h1>
          <p
            className={text.body}
            style={{ color: vars.inkSoft, marginTop: space["1.5"] }}
          >
            6 things on today · 4h 40m planned work · 1 overdue · 4 in inbox to
            triage.
          </p>
        </header>

        <div
          className={sprinkles({ display: "flex", gap: "2", flexWrap: "wrap" })}
        >
          <Button variant="solid">⌘K capture</Button>
          <Button variant="glass">triage 4 →</Button>
          <Button variant="glass">open calendar →</Button>
        </div>

        <div
          className={sprinkles({
            display: "grid",
            gap: "4",
          })}
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          <Glass radius="lg" fill="regular">
            <div
              className={sprinkles({
                p: "6",
                display: "flex",
                flexDirection: "column",
                gap: "3",
              })}
            >
              <Caption>what to do today</Caption>
              <h2 className={display.sectionHead} style={{ margin: 0 }}>
                In scheduler order
              </h2>
              <p
                className={text.body}
                style={{ color: vars.inkSoft, margin: 0 }}
              >
                The shell hosts this. Try the sidebar collapse chevron, the
                theme toggle, ⌘K, or resize the window below 768px.
              </p>
            </div>
          </Glass>

          <Glass radius="lg" fill="regular">
            <div
              className={sprinkles({
                p: "6",
                display: "flex",
                flexDirection: "column",
                gap: "3",
              })}
            >
              <Caption>priority goals · 3</Caption>
              <h2 className={display.statCard} style={{ margin: 0 }}>
                58%
              </h2>
              <ProgressBar
                value={58}
                color="#6366f1"
                ticks={[10, 25, 50, 75, 90]}
              />
            </div>
          </Glass>

          <Glass radius="lg" fill="regular">
            <div
              className={sprinkles({
                p: "6",
                display: "flex",
                flexDirection: "column",
                gap: "3",
              })}
            >
              <Caption>plan with ai</Caption>
              <div
                className={sprinkles({
                  display: "flex",
                  alignItems: "center",
                  gap: "3",
                })}
              >
                <ConicDot size={16} />
                <span className={text.bodyLg}>✦ Draft this week&apos;s goals</span>
              </div>
              <Button variant="glass" size="sm">
                start session →
              </Button>
            </div>
          </Glass>
        </div>
      </div>
    </AppShell>
  );
}

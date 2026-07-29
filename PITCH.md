# Circadium

**Circadium turns everything you're trying to do into a real, placed weekly calendar — automatically.**

You give it your goals, tasks, and the fixed shape of your week. It figures out *when* each thing actually happens: fitting work into the gaps, respecting deadlines and priorities, and even slotting in travel time between locations. When something changes, the whole schedule reflows.

---

## The problem it solves

Most task apps give you a list. Lists don't tell you when you'll actually do anything — you're left to slot it all into your calendar by hand, and re-slot it every time life shifts.

Circadium closes that gap. It treats scheduling as a solver problem: given what you want to accomplish and the constraints on your time, produce a concrete plan. You maintain the *inputs* (goals, priorities, the rhythm of your week); the app maintains the *calendar*.

---

## How you think about your time

**Roles.** At the top level you name the roles you play in life — Parent, Professional, Athlete, Friend. (Covey's framing.) Everything you do hangs off one of them. Under the hood these are the top level of a category hierarchy, but you experience them as roles.

**Goals, tasks, and plans.** The core unit is a schedulable row:
- A **task** is a single chunk of work with a duration.
- A **goal** is a tree of subtasks that get scheduled in order — a project, essentially.
- A **plan** is anchored to a fixed time (a meeting, an appointment). Plans can repeat.

Goals only start scheduling once they're *ready* (they have subtasks and a deadline). Tasks are ready the moment you create them.

**Categories and time windows.** Categories can own **time windows** — "work happens Mon–Fri 9–5", "gym time is evenings". The scheduler places category work only inside those windows. Strict windows are exclusive (only work goes in work time); soft windows just express a preference. Windows cascade down the hierarchy, so anything under "Work" can use a "Work" window.

**Locations and travel.** Every item can have a location. When two back-to-back items are in different places, Circadium injects a **travel event** between them, sized from real Google Maps travel times (driving, transit, cycling, walking, with rush-hour awareness). "Anywhere" items need no travel.

---

## What the scheduler does for you

The engine takes your goals, templates, categories, and preferences and produces a fully placed calendar. Along the way it handles:

- **Priorities and deadlines** — more urgent, more important work wins the better slots.
- **Splitting** — a big task can be broken into dynamically sized chunks spread across days, with optional minimum spacing between chunks.
- **Daily caps** — cap how many minutes of a goal land on any single day, so a big push spreads out instead of eating one afternoon.
- **Scheduling constraints** — "not before this date", "only on weekday mornings" — inherited down a goal's tree.
- **Sequencing** — two ways to say "this before that":
  - **Queues** (pipes): an ordered list of goals/tasks that run one after another.
  - **Dependencies**: prerequisite edges between any two items — "finish A before starting B".
- **Detours** — splice one goal's work *inside* another goal's sequence when they interleave in real life.

When you drag an event, change a buffer, or finish a task, the engine re-runs and everything downstream re-places. Completed work is frozen where it actually happened and never reshuffles.

You can see the sequencing logic itself on a **graph view**: queues as lanes, dependencies as arrows, laid out over a real time axis.

---

## The AI assistant

Circadium has a built-in assistant that can set up and restructure your whole plan in plain conversation — "help me plan my week and this goal" in one chat. It can:

- Create and restructure goals with full subtrees.
- Build your weekly template (sleep, work hours, standing commitments).
- Manage categories and their time windows.
- Wire up queues and dependencies.

You review everything it proposes in a side-by-side diff — Goals / Week / Categories / Queues tabs — before saving. Nothing touches your real data until you click Save.

---

## First run

New accounts get a short guided setup: welcome, pick your roles, add your key locations, sketch the shape of your week (sleep, work hours, routines), brain-dump everything on your mind, then hand that dump to the AI to triage into real tasks and goals. Each step commits as you go, so you can stop and come back.

---

## In one line

> A personal scheduling engine that takes the tree of things you want to do and the constraints on your time, and keeps a real, travel-aware weekly calendar placed for you — reflowing the moment anything changes.

---

*This is the plain-language overview. For engineering internals — the scheduling engine, data model, sync architecture, and design system — see [CLAUDE.md](CLAUDE.md) and [documentation/calendar-generation-deep-dive.md](documentation/calendar-generation-deep-dive.md).*

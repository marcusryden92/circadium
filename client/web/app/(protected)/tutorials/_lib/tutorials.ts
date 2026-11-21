// Written tutorials for Circadium, ordered from the overarching concepts down
// to the granular. Content is structured as blocks so it renders through the
// design system rather than raw HTML. Paragraph, list, and term text may carry
// **bold** spans for feature names.

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "terms"; items: { term: string; def: string }[] }
  | { kind: "note"; text: string };

export type Article = {
  slug: string;
  title: string;
  summary: string;
  blocks: Block[];
};

export type TutorialSection = {
  title: string;
  articles: Article[];
};

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    title: "Getting started",
    articles: [
      {
        slug: "welcome",
        title: "Welcome to Circadium",
        summary: "What Circadium does and how you'll use it.",
        blocks: [
          {
            kind: "p",
            text: "Circadium turns everything you need and want to do into a real, laid-out weekly calendar. You tell it *what* matters — the errands, the projects, the commitments, the routines — and it works out *when* each thing can actually happen.",
          },
          { kind: "h", text: "The idea in one breath" },
          {
            kind: "p",
            text: "Most planners are empty boxes you have to fill in by hand. You do all the deciding: which afternoon that report goes in, whether there's time for the gym, what to move when a meeting runs long. Circadium flips that around. You describe your life once, and it does the placing for you.",
          },
          {
            kind: "p",
            text: "Better still, the plan never goes stale. The moment something changes — a meeting moves, a deadline shifts, you finish early or fall behind — Circadium quietly reshuffles everything so what you're looking at is always doable *today*, not a plan you made on Sunday that fell apart by Tuesday.",
          },
          { kind: "h", text: "How you'll use it" },
          {
            kind: "ol",
            items: [
              "**Capture** whatever is on your mind, without worrying yet about when it will happen.",
              "Shape each thing into a **task**, a **plan**, or a **goal**, so Circadium knows what it is.",
              "Tell it the fixed parts of your week — when you sleep, work, and so on.",
              "Let it build your **calendar**, and adjust as life changes.",
            ],
          },
          {
            kind: "p",
            text: "You don't have to do all of that on day one. Plenty of people start by just capturing a few tasks and letting Circadium place them, then add structure — roles, routines, deadlines — as they go. The app is useful the moment you put one thing into it.",
          },
          {
            kind: "note",
            text: "These tutorials run from the big picture down to the finer details. Read them in order for the full tour, or jump straight to whatever you're curious about using the list on the left.",
          },
        ],
      },
      {
        slug: "tasks-plans-goals",
        title: "Tasks, plans & goals",
        summary: "The three kinds of thing everything in Circadium becomes.",
        blocks: [
          {
            kind: "p",
            text: "Almost everything in Circadium is one of three things. Getting a feel for the difference is the single most useful thing you can learn, because it decides how the app treats each item — whether it gets a fixed spot, a flexible one, or gets broken into pieces.",
          },
          {
            kind: "terms",
            items: [
              {
                term: "Task",
                def: "Something you need to do that takes some time but doesn't have to happen at a fixed moment — \"reply to Dana,\" \"buy a birthday gift,\" \"clean the garage.\" You give it a rough duration, and Circadium finds a slot for it whenever there's room. Most of what you enter will be tasks.",
              },
              {
                term: "Plan",
                def: "Something that happens at a set time you don't control — an appointment, a class, a dinner reservation, a flight. You pick when it starts and it stays put; Circadium schedules everything else around it. Plans are the only thing you pin to the clock, and they can repeat, like every Monday or every morning.",
              },
              {
                term: "Goal",
                def: "A bigger outcome that's too much for one sitting — \"launch the website,\" \"get fit,\" \"plan the trip.\" You break it into smaller subtasks, and Circadium schedules those steps for you, in the order you set, spreading them out so the whole thing is finished by its deadline.",
              },
            ],
          },
          { kind: "h", text: "Which one should I pick?" },
          {
            kind: "ul",
            items: [
              "If it's a single thing you'll just do sometime, make it a **task**.",
              "If it must land at a specific time, make it a **plan**.",
              "If it's too big for one sitting and has parts, make it a **goal**.",
            ],
          },
          {
            kind: "p",
            text: "A goal is really just a task with a plan of attack. You still say roughly how long each step takes; the difference is that Circadium treats the steps as a set working toward one finish line, rather than as unrelated to-dos.",
          },
          {
            kind: "note",
            text: "Not sure? Start with a task. You can change an item's type at any time from its detail page, and nothing you've written is lost — a task you outgrow can become a goal, and its subtasks come along.",
          },
        ],
      },
    ],
  },
  {
    title: "Capturing & organizing",
    articles: [
      {
        slug: "capture",
        title: "Capturing your ideas",
        summary: "A place to empty your head, sort later.",
        blocks: [
          {
            kind: "p",
            text: "The hardest part of staying organized is that ideas show up at the worst times — mid-shower, mid-meeting, just as you're falling asleep. **Capture** is the pressure valve: a single place to dump anything the moment it occurs to you, so you can let go of it and get back to what you were doing.",
          },
          { kind: "h", text: "Jot now, sort later" },
          {
            kind: "p",
            text: "When you capture something, you don't have to decide what it is, when it happens, or how long it takes. You just type it and move on. It lands in a holding area — out of the way of your real calendar, waiting for you.",
          },
          {
            kind: "p",
            text: "Later, when you have a quiet minute, you go back and give each note a shape: turn it into a task, flesh it out into a goal, or set a time to make it a plan. This step is called triaging, and it's where a messy brain-dump becomes a real plan. Doing it in a calm batch is far easier than deciding everything in the heat of the moment.",
          },
          { kind: "h", text: "Why separate capturing from sorting?" },
          {
            kind: "ul",
            items: [
              "Capturing is instant, so you actually do it instead of losing the thought or breaking your focus.",
              "Unsorted notes never clutter your calendar — Circadium leaves them completely alone until you've shaped them.",
              "Sorting later, all at once, lets you see the whole pile and make better calls about what matters.",
            ],
          },
          {
            kind: "note",
            text: "Open Capture from anywhere with the big plus button or its keyboard shortcut. If you'd rather not sort by hand, the AI assistant can take a pile of raw notes and turn them into shaped tasks and goals for you to approve.",
          },
        ],
      },
      {
        slug: "roles-categories",
        title: "Roles & categories",
        summary: "Organizing your life the way you actually live it.",
        blocks: [
          {
            kind: "p",
            text: "A long, flat to-do list flattens everything into the same grey pile, and the loudest, most urgent items drown out the ones that quietly matter most. Circadium organizes your life differently — around the **roles** you play and the areas they cover — so nothing important gets lost.",
          },
          { kind: "h", text: "Roles" },
          {
            kind: "p",
            text: "A role is a hat you wear: Parent, Professional, Friend, Athlete, Homeowner. Roles are the top level of your organization. The thinking behind them is simple: a balanced life means tending to each of the roles you care about, not just whichever one is shouting the loudest this week. Seeing your work grouped by role makes it obvious when one part of your life is being starved.",
          },
          { kind: "h", text: "Categories" },
          {
            kind: "p",
            text: "Inside a role you can add **categories** — finer areas like \"Client work\" or \"Fitness\" under your Professional or Athlete role. Every task, plan, or goal can belong to one. Beyond keeping related things together and giving them a shared color across the app, categories are how you teach Circadium the rhythm of your week.",
          },
          { kind: "h", text: "Time windows" },
          {
            kind: "p",
            text: "A category can carry **time windows** — the parts of the week when that kind of work is allowed to happen. If \"Client work\" only has windows on weekday afternoons, Circadium won't drop client tasks into your Saturday morning. It's one of the most powerful ways to shape your week without micromanaging every single item: set the rhythm once on the category, and everything filed under it follows.",
          },
          {
            kind: "ul",
            items: [
              "A **strict** window is reserved: only that category's work can go there, protecting the time even if nothing's scheduled yet.",
              "A **soft** window is a preference: that work prefers it, but other things can still fill the gaps rather than leaving them empty.",
            ],
          },
          {
            kind: "note",
            text: "You don't have to set up windows to get started. Roles and categories are useful on their own just for keeping things tidy and color-coded — add windows later, once you notice a kind of work that belongs at particular times.",
          },
        ],
      },
      {
        slug: "week",
        title: "Shaping your week",
        summary: "The fixed scaffolding Circadium plans around.",
        blocks: [
          {
            kind: "p",
            text: "Before Circadium can place your tasks, it needs to know the shape of a normal week — the hours that are already spoken for. This is your **week structure**, and it's the difference between a schedule that respects your life and one that tries to book a task at 3 a.m.",
          },
          { kind: "h", text: "The fixed scaffolding" },
          {
            kind: "ul",
            items: [
              "When you **sleep**.",
              "When you **work** or study.",
              "Morning and evening **routines** you keep.",
              "Any standing commitments that repeat every week.",
            ],
          },
          {
            kind: "p",
            text: "These become repeating blocks that Circadium schedules around. It will never try to book a task in the middle of your sleep or your work hours — unless you've deliberately told it that that kind of work belongs there. Everything you add later gets placed in the gaps this scaffolding leaves behind.",
          },
          { kind: "h", text: "Set it once, adjust anytime" },
          {
            kind: "p",
            text: "You'll usually set this up when you first sign in, but it's not a one-time decision carved in stone. Reshape it whenever your routine changes — a new job, a different sleep schedule, a season of early mornings — and the calendar rebuilds itself to match, moving your tasks into the new gaps automatically.",
          },
          {
            kind: "note",
            text: "Think of the week structure as the walls of a room and your tasks as the furniture. Circadium arranges the furniture beautifully, but it never puts a piece through a wall.",
          },
        ],
      },
      {
        slug: "locations",
        title: "Locations & travel time",
        summary: "So your schedule accounts for getting places.",
        blocks: [
          {
            kind: "p",
            text: "If your day moves between places — home, the office, the gym, the shops — the time spent getting there is real. A plan that ignores it looks tidy on screen and falls apart in life. Circadium can account for travel so your schedule is one you could actually follow.",
          },
          { kind: "h", text: "Places you go" },
          {
            kind: "p",
            text: "You can save **locations** you visit regularly, then attach a location to a task, a category, or a role: \"this errand is at the shops,\" \"all my gym sessions are at the gym,\" \"anything under my Professional role happens at the office.\"",
          },
          { kind: "h", text: "Travel gets added automatically" },
          {
            kind: "p",
            text: "When two back-to-back items are in different places, Circadium slips a **travel block** between them, sized to the real trip, so you're never expected to be in two places at once. When the next thing is in the same place you already are, no travel is added and no time is wasted. It quietly does the geography for you.",
          },
          {
            kind: "ul",
            items: [
              "Leave a location blank and it's treated as **Anywhere** — something you could do from wherever you happen to be, so no travel is needed.",
              "Items can inherit their location from their category or role, so you set it in one place instead of on every single task.",
            ],
          },
          {
            kind: "note",
            text: "Travel time only shows up when it actually matters. For most of your day, where you already are is where the next thing happens, and your calendar stays uncluttered.",
          },
        ],
      },
    ],
  },
  {
    title: "How your calendar is built",
    articles: [
      {
        slug: "calendar",
        title: "Your calendar & readiness",
        summary: "The calendar builds itself — here's how to steer it.",
        blocks: [
          {
            kind: "p",
            text: "The calendar is where it all comes together: a full week, laid out, with every ready task and goal placed into a real slot alongside your fixed commitments. The mindset shift is this — you don't fill the calendar in. Circadium does. Your job is to feed it good information and nudge it when you disagree.",
          },
          { kind: "h", text: "It builds itself" },
          {
            kind: "p",
            text: "Whenever you add, change, or finish something, Circadium re-plans on the spot. Set a new deadline and it shuffles to make room. Mark a task done and the freed time gets handed to whatever was waiting. Add five things at once and it fits them all in around each other. You're always looking at the best current plan, not a snapshot that's slowly going out of date.",
          },
          {
            kind: "p",
            text: "As you move through your day you'll check things off. Completed work stays on the calendar where it actually happened, and anything you didn't get to simply flows forward into the next opening — no guilt, no manual rescheduling.",
          },
          { kind: "h", text: "Readiness: the on/off switch" },
          {
            kind: "p",
            text: "An item only gets scheduled once it's marked **ready**. This is deliberate. It lets you capture and shape half-formed ideas without them barging onto your calendar before you've decided they're real.",
          },
          {
            kind: "ul",
            items: [
              "Tasks and plans are **ready** the moment you make them — they're usually clear enough to schedule right away.",
              "A goal stays **not ready** until it has subtasks and either a deadline or a repeat rhythm — because until then, Circadium genuinely doesn't know enough to place its steps.",
            ],
          },
          {
            kind: "p",
            text: "So if something you expected isn't showing up on the calendar, readiness is the very first thing to check.",
          },
          {
            kind: "note",
            text: "Prefer a thing somewhere else? Drag the block to where you want it. Circadium keeps your choice and re-plans everything else around it — you and the app are working together, not fighting over the calendar.",
          },
        ],
      },
      {
        slug: "deadlines-priorities",
        title: "Deadlines, priorities & limits",
        summary: "Deciding what wins when things compete for a slot.",
        blocks: [
          {
            kind: "p",
            text: "There's never quite enough time for everything, so when several things want the same slot, Circadium has to choose. A few simple dials let you steer that choice — so it matches your judgement — without hand-placing every item yourself.",
          },
          { kind: "h", text: "Deadlines" },
          {
            kind: "p",
            text: "A **deadline** is the single most useful signal you can give. It tells Circadium the latest something can happen, and the app works backward from there — reserving time in advance, and letting anything due sooner take priority over things with room to spare. A deadline is a promise Circadium helps you keep, not just a date it displays.",
          },
          { kind: "h", text: "Priority" },
          {
            kind: "p",
            text: "**Priority** is how much something matters to you, on a simple scale. When two items could go in the same place and neither is more urgent, the higher-priority one wins the slot. Use it sparingly, though — if you mark everything as top priority, you've told Circadium nothing, because now nothing stands out.",
          },
          { kind: "h", text: "Daily limits" },
          {
            kind: "p",
            text: "For a big goal, you can set a **daily limit** — the most time its work should take on any single day. \"Studying, but no more than two hours a day.\" Rather than cramming the whole goal into one exhausting marathon because there happened to be a free afternoon, Circadium paces it out across days, which is usually how big things actually get done well.",
          },
          {
            kind: "note",
            text: "You rarely need all three at once. A deadline alone handles most things; reach for priority when two things genuinely clash, and for daily limits when a goal is big enough that pacing matters.",
          },
        ],
      },
      {
        slug: "splitting",
        title: "Splitting big tasks",
        summary: "Break one long task into chunks across your free time.",
        blocks: [
          {
            kind: "p",
            text: "Some tasks are just long. A four-hour stretch of writing or a big cleanout won't fit in the gaps of a busy day, and forcing it into one unbroken block would swallow your whole afternoon and probably never get scheduled at all. **Splitting** solves this by letting Circadium break one task into several smaller chunks and scatter them across whatever free time you have.",
          },
          { kind: "h", text: "How it works" },
          {
            kind: "p",
            text: "You tell it the shortest and longest a chunk should be — say, no less than 30 minutes so it's worth sitting down for, and no more than 90 so it doesn't dominate a day. Circadium then fits chunks into whatever gaps it finds, sizing each one to the space available, until the whole task is accounted for.",
          },
          {
            kind: "ul",
            items: [
              "Set a **daily cap** so it never does too much of one task in a single day.",
              "Set a **minimum gap** so the chunks get some breathing room instead of stacking back to back.",
            ],
          },
          {
            kind: "p",
            text: "As you complete chunks, only the leftover time gets rescheduled — the work you've already done is banked. When the chunks add up to the full duration, the task marks itself done automatically.",
          },
          {
            kind: "note",
            text: "Splitting is perfect for anything that's really \"keep chipping away at this\" — reading, writing, studying, tidying, practising. It turns an intimidating block into a series of manageable sittings.",
          },
        ],
      },
      {
        slug: "timing-rules",
        title: "Timing rules",
        summary: "Fence off when a task is allowed to happen.",
        blocks: [
          {
            kind: "p",
            text: "By default, a task can land in any free moment that fits. But sometimes that's not quite right — a task might not make sense at certain times, or not before a certain day. Two gentle rules let you fence off *when* something is allowed to happen, without pinning it to one exact moment the way a plan would.",
          },
          {
            kind: "terms",
            items: [
              {
                term: "Earliest start",
                def: "The soonest something may begin. \"Don't schedule this before Monday,\" \"not until the package arrives,\" \"only after the client sends the brief.\" Circadium won't place it a single moment sooner, and will happily hold it until the day arrives.",
              },
              {
                term: "Allowed times",
                def: "The days and hours a task is permitted to land in. \"Phone calls only on weekday mornings,\" \"workouts only in the evening,\" \"admin only on Fridays.\" Circadium keeps the task inside those windows and finds the best spot within them.",
              },
            ],
          },
          {
            kind: "p",
            text: "Both rules apply to tasks and to goals, and here's the handy part: a goal's rules flow down to all of its steps. Set \"weekday mornings only\" once on the goal, and every subtask underneath obeys it automatically — you don't have to repeat yourself on each one.",
          },
          {
            kind: "note",
            text: "If a task has rules so tight that nothing can possibly fit, Circadium tells you plainly rather than silently dropping it and letting you find out the hard way. Loosen the rule a little and it'll find a home.",
          },
        ],
      },
    ],
  },
  {
    title: "Ordering & rhythms",
    articles: [
      {
        slug: "queues-dependencies",
        title: "Ordering work: queues & dependencies",
        summary: "Two ways to say \"this comes before that\" — one finite, one open-ended.",
        blocks: [
          {
            kind: "p",
            text: "Plenty of work only makes sense in a certain order. You can't paint the wall before you patch it, and you can't send the invitations before you've booked the venue. Circadium gives you two ways to lock in that order — and choosing between them comes down to one question: does the work have an end?",
          },
          { kind: "h", text: "Dependencies" },
          {
            kind: "p",
            text: "A **dependency** is a single \"this before that\" link between two specific items. \"Book the venue\" before \"send invitations.\" Circadium will always finish the first before it starts the second, and if something ever makes that impossible — a deadline that no longer leaves room — it warns you instead of quietly doing the wrong thing. Reach for a dependency when two otherwise-independent items happen to have one ordering rule between them.",
          },
          { kind: "h", text: "Queues" },
          {
            kind: "p",
            text: "A **queue** is an ordered line of work that runs one item after another. You drop things into it, arrange them, and Circadium works down the line in order — never starting the next until the one before it is done.",
          },
          {
            kind: "p",
            text: "So why have queues at all, when goals also order their steps? Because a **goal is finite** — it's a specific outcome with an end. It has known steps, and one day it's simply *done*. But a lot of ordered work never really finishes. Think of your everyday work tasks: they need to happen in a sensible order, but there's no single outcome tying them together and no finish line to cross. You wouldn't want to stuff them all into one enormous goal called \"Work\" that can never be completed and just grows forever.",
          },
          {
            kind: "p",
            text: "That's exactly what a queue is for: an open-ended stream you keep feeding. New tasks show up, you slot them into the line wherever they belong, and Circadium keeps working through them in order. Nothing has to be \"finished\" for the queue to make sense — it's a lane of ongoing work, not a project with a destination.",
          },
          {
            kind: "ul",
            items: [
              "Reach for a **goal** when there's a clear finish — a project with an outcome and, usually, a deadline.",
              "Reach for a **queue** when there's an ongoing order but no end — a lane of work you keep topping up.",
              "Reach for a **dependency** for a one-off \"A needs B first\" between two items that otherwise stand on their own.",
            ],
          },
          {
            kind: "note",
            text: "You can see and rearrange all of this visually on the Graph view, where queues show up as lanes and dependencies as arrows between items — there's a tutorial for that next.",
          },
        ],
      },
      {
        slug: "habits",
        title: "Repeating tasks & habits",
        summary: "Things you want to happen again and again.",
        blocks: [
          {
            kind: "p",
            text: "Not everything is one-and-done. A lot of a good life is made of things you want to happen again and again — exercise, journaling, watering the plants, calling a friend. Circadium handles these in two connected ways: one that *schedules* the repetition, and one that *tracks* it.",
          },
          { kind: "h", text: "Repeating items" },
          {
            kind: "p",
            text: "Any task or goal can be given a **repeat rhythm** — daily, weekly, whatever suits it. Instead of scheduling it just once, Circadium places a fresh occurrence every period: \"meditate 20 minutes every morning,\" \"deep-clean the kitchen sometime each week.\" Each time around, it finds a good slot on its own, so the habit keeps showing up without you re-adding it.",
          },
          {
            kind: "p",
            text: "This is different from a repeating plan. A plan repeats at a *fixed* time — the same 7 a.m. every day. A repeating task is *flexible*: Circadium picks the best moment inside each day or week, fitting it around everything else, so \"exercise sometime today\" lands wherever there's actually room.",
          },
          { kind: "h", text: "Habits" },
          {
            kind: "p",
            text: "A **habit** is a tracker you lay over a repeating item to watch how you're really doing. It shows a calendar grid of your hits and misses, your current streak, and how consistent you've been over time — the gentle accountability that turns a good intention into a routine. You group habits into your own buckets, kept separate from your task categories, so all your morning-routine habits can sit together.",
          },
          {
            kind: "note",
            text: "The two work as a pair: the repeating item does the scheduling, the habit does the score-keeping. Set up the repeat first, then add a habit on top of it when you want to start tracking your streak.",
          },
        ],
      },
    ],
  },
  {
    title: "Extra views & help",
    articles: [
      {
        slug: "views",
        title: "The graph & mind map",
        summary: "Two other ways to see your life.",
        blocks: [
          {
            kind: "p",
            text: "The calendar answers \"what am I doing and when?\" — but that's not the only question worth asking. Circadium gives you two other views, each built to answer a different one.",
          },
          { kind: "h", text: "The graph" },
          {
            kind: "p",
            text: "The **graph** lays your work out along a timeline and shows how it's ordered: queues appear as lanes, and dependencies as arrows connecting one item to the next. It's the place to see and adjust sequence at a glance — drag an item to reorder a queue, draw a line between two items to add a dependency, or spot anything that's ended up scheduled out of order. If \"ordering work\" is on your mind, this is where you do it.",
          },
          { kind: "h", text: "The mind map" },
          {
            kind: "p",
            text: "The **mind map** shows structure instead of time: your roles branching into their categories, and those into your goals and their steps, as a zoomable tree. It's the bird's-eye view of your whole life — the one to open when you want to step back and ask whether you're spread sensibly across everything you care about, or whether one role has quietly taken over.",
          },
          {
            kind: "note",
            text: "In short: the calendar answers *when*, the graph answers *in what order*, and the mind map answers *how it all fits together*.",
          },
        ],
      },
      {
        slug: "assistant",
        title: "The AI assistant",
        summary: "Describe what you want; review the changes it drafts.",
        blocks: [
          {
            kind: "p",
            text: "The **AI assistant** is a conversation you can have with your planner. Instead of clicking through screens, you describe what you want in plain words — \"help me set up a week that protects my mornings,\" \"break my thesis into a plan,\" \"turn these ten notes into proper tasks,\" \"add a meditation habit\" — and it drafts the changes for you.",
          },
          {
            kind: "p",
            text: "It's especially good at the tedious parts: triaging a big pile of captured notes, sketching out the steps of a goal you only have a vague shape for, or reshaping your week when your life changes. Think of it as a planning partner that does the fiddly setup so you can just react to a draft.",
          },
          { kind: "h", text: "You're always in control" },
          {
            kind: "p",
            text: "The assistant never changes anything behind your back. It *proposes* — new goals, a tweaked week, categories, queues, habits — and shows you exactly what would change in a clear, side-by-side review. You read it over, and nothing becomes real until you click **Save**. If you don't like a suggestion, you just don't save it.",
          },
          { kind: "h", text: "Bring your own key" },
          {
            kind: "p",
            text: "The assistant runs on your own AI provider key, which stays encrypted on your own device and is never sent to our servers. You set this up once. And if you'd rather not use AI at all, you can simply leave it switched off — every other part of Circadium works perfectly well without it.",
          },
          {
            kind: "note",
            text: "It's the fastest way to get from a vague intention to a structured plan — but it's optional, and it always hands you the final say.",
          },
        ],
      },
      {
        slug: "external-calendars",
        title: "Connecting other calendars",
        summary: "So Circadium plans around commitments it doesn't own.",
        blocks: [
          {
            kind: "p",
            text: "You almost certainly keep some of your life in another calendar already — Google, Outlook, a shared family calendar, your kid's school schedule. Circadium can read those, so it plans around the commitments it doesn't own instead of double-booking you on top of them.",
          },
          { kind: "h", text: "Busy is busy" },
          {
            kind: "p",
            text: "Once you connect a calendar, its events show up in Circadium as **busy blocks**. It treats them just like the walls of your week structure: it won't schedule your tasks over a meeting it imported, even though it has no power to move that meeting for you. The result is a plan that respects your whole life, not just the parts you typed in here.",
          },
          {
            kind: "ul",
            items: [
              "Connect a **Google** or **Microsoft** account, or paste a calendar's public share link.",
              "For each calendar, choose whether it **blocks scheduling** or is just shown for reference — handy for calendars you want to see but not plan around.",
            ],
          },
          {
            kind: "p",
            text: "These calendars are strictly read-only inside Circadium. It looks, but it never touches — your outside events stay exactly where they are, edited only in their original app.",
          },
          {
            kind: "note",
            text: "This is what makes Circadium's plan trustworthy enough to actually follow: it accounts for everything you're committed to, not only the tasks you keep here.",
          },
        ],
      },
    ],
  },
];

export const TUTORIAL_ARTICLES: Article[] = TUTORIAL_SECTIONS.flatMap(
  (section) => section.articles,
);

export function findArticleIndex(slug: string): number {
  return TUTORIAL_ARTICLES.findIndex((a) => a.slug === slug);
}

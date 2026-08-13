"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Grain, Logo } from "@/components/ui";
import { themeLight } from "@/lib/theme";
import { VectorField } from "@/components/landing/VectorField";
import { Cascade } from "@/components/landing/Cascade";
import {
  FeatureVignette,
  type FeatureVignetteKind,
} from "@/components/landing/FeatureVignettes";
import { ReflowDemo } from "@/components/landing/ReflowDemo";
import {
  page,
  hero,
  heroScrim,
  heroNav,
  heroWordmark,
  navActions,
  heroSignIn,
  heroContent,
  heroHeadline,
  heroSubhead,
  heroCta,
  heroCtaNote,
  pillNav,
  pillNavVisible,
  pillNavSecondary,
  pillNavWordmark,
  leadSection,
  leadInner,
  leadText,
  leadEmphasis,
  prose,
  proseSection,
  proseSectionDark,
  proseGrid,
  proseAside,
  proseNumber,
  proseRule,
  proseHeading,
  proseBody,
  proseLine,
  proseEmphasis,
  featuresSection,
  featuresHeader,
  featuresKicker,
  featuresHeading,
  featuresList,
  featureRow,
  featureRowReverse,
  featureVisual,
  featureContent,
  featureIndex,
  featureName,
  featureBody,
  closeSection,
  closeCard,
  closeScrim,
  closeInner,
  closeHeading,
  closeBody,
  closeActions,
  closeNote,
  footer,
  footerLinks,
  footerLink,
} from "./page.css";

type Line = { text: string; emphasis?: boolean };

type Section = {
  heading: string;
  kicker: string;
  body: Line[];
  dark?: boolean;
  demo?: boolean;
};

type Feature = {
  kind: FeatureVignetteKind;
  name: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    kind: "engine",
    name: "A scheduling engine",
    body: "Tell Circadium what matters — type it in, or talk it through with the built-in assistant. It returns a week that respects your goals, your deadlines, and the constraints around them, without you arranging a single block.",
  },
  {
    kind: "travel",
    name: "Locations & travel",
    body: "Every place you work from, every commute between them. The engine knows what's reachable and routes time across driving, transit, cycling, and walking.",
  },
  {
    kind: "windows",
    name: "Time-aware categories",
    body: "Define when each part of life is allowed to happen. Strict windows that block everything else, soft ones that only suggest. Deep work mornings, errands after five.",
  },
  {
    kind: "goals",
    name: "Goals with subtasks",
    body: "Break large goals into ordered steps — and let goals depend on each other. Buying a car waits on the license, the savings, the job that pays for it. The engine schedules the whole chain knowing it, woven around everything else in your week.",
  },
];

const SECTIONS: Section[] = [
  {
    kicker: "The problem",
    heading: "Planning is two jobs.",
    body: [
      {
        text: "Deciding what matters — and re-deciding when it all happens, every time something moves.",
        emphasis: true,
      },
      {
        text: "The first job is yours alone. It takes judgment: your goals, your values, your call.",
      },
      {
        text: "The second is logistics. Durations, deadlines, locations, travel, open slots — a constraint problem with a thousand moving pieces, and it reopens every time the day shifts.",
      },
      { text: "You were never meant to solve that one by hand." },
      {
        text: "Circadium takes the second job off your hands entirely. You set the direction, and it builds the week.",
        emphasis: true,
      },
    ],
  },
  {
    kicker: "The friction",
    dark: true,
    demo: true,
    heading: "When the plan breaks, the deciding begins.",
    body: [
      {
        text: "A meeting runs over. The gym is now impossible, and there are ninety orphaned minutes where the plan used to be.",
      },
      {
        text: "The language, the instrument, the training, the side project — any of them would count. But choosing between them costs more energy than doing them, so too often the gap goes to nothing.",
      },
      {
        text: "That deciding is the work Circadium takes over.",
        emphasis: true,
      },
      {
        text: "When something moves, the whole week is recomputed around what matters most right now. The gap arrives with its answer already in it.",
      },
      {
        text: "And it's yours to overrule — drop anything in by hand, and the week flows around it.",
      },
      {
        text: "No end-of-day re-planning session, no willpower spent on triage.",
      },
      { text: "You decide what matters." },
      { text: "The engine decides what's next.", emphasis: true },
    ],
  },
  {
    kicker: "The point",
    heading: "A productive day can still be a wasted day.",
    body: [
      {
        text: "You can clear your inbox, finish a dozen tasks, sit through every meeting — and make no real progress on anything that matters.",
      },
      {
        text: "Doing more isn't the same as moving forward.",
        emphasis: true,
      },
      {
        text: "Productivity is a means. Its point is what it buys — the language learned, the strength kept, the people you show up for.",
      },
      {
        text: "That's why Circadium doesn't start with a task list. It starts with the roles you play in life — parent, friend, professional — and builds the week outward from them.",
      },
      {
        text: "A schedule is a claim about what your life is for. Circadium's job is to make your weeks match it.",
        emphasis: true,
      },
    ],
  },
];

const SECTION_TOTAL = String(SECTIONS.length).padStart(2, "0");

export default function Home() {
  const router = useRouter();
  const heroRef = useRef<HTMLElement>(null);
  const [pastHero, setPastHero] = useState(false);
  const goLogin = () => router.push("/auth/login");
  const goRegister = () => router.push("/auth/register");

  useEffect(() => {
    const node = heroRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <main className={`${themeLight} ${page} custom-scrollbar`}>
      <div className={pastHero ? `${pillNav} ${pillNavVisible}` : pillNav}>
        <Link href="/" className={pillNavWordmark}>
          <Logo size={19} />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className={pillNavSecondary}
          onClick={goLogin}
        >
          Sign in
        </Button>
        <Button variant="solid" size="sm" onClick={goRegister}>
          Start free
        </Button>
      </div>

      <section ref={heroRef} className={hero}>
        <VectorField />
        <div className={heroScrim} aria-hidden />
        <header className={heroNav}>
          <Link href="/" className={heroWordmark}>
            <Logo size={28} tone="#f2efea" />
          </Link>
          <div className={navActions}>
            <button type="button" className={heroSignIn} onClick={goLogin}>
              Sign in
            </button>
            <Button variant="solidLight" size="md" onClick={goRegister}>
              Start free
            </Button>
          </div>
        </header>
        <Cascade className={heroContent} onMount>
          <h1 className={heroHeadline}>
            Always know what to do <em>next</em>
          </h1>
          <p className={heroSubhead}>
            Plans break. Priorities shift. Circadium re-sorts your day.
          </p>
          <div className={heroCta}>
            <Button variant="solidLight" size="lg" onClick={goRegister}>
              Start free →
            </Button>
            <span className={heroCtaNote}>Free while in beta.</span>
          </div>
        </Cascade>
      </section>

      <section className={leadSection}>
        <Cascade className={leadInner}>
          <p className={leadText}>
            The real cost of a broken plan isn&apos;t the lost hour — it&apos;s
            the deciding that follows. A gap opens, three things could fill it,
            and you end up spending the free hour deciding what the free hour is
            for.
          </p>
          <p className={leadText}>
            Circadium computes a week around your goals, commitments, locations,
            and constraints — and when life shifts, it re-sorts, so the next
            right thing is already waiting.
          </p>
          <p className={leadEmphasis}>
            The result isn&apos;t a perfectly optimized calendar. It&apos;s a
            week you can actually live.
          </p>
        </Cascade>
      </section>

      <div className={prose}>
        {SECTIONS.map((s, i) => (
          <section
            key={s.heading}
            className={s.dark ? proseSectionDark : proseSection}
          >
            {s.dark ? <Grain /> : null}
            <Cascade className={proseGrid}>
              <aside className={proseAside} data-cascade>
                <span className={proseNumber}>
                  {String(i + 1).padStart(2, "0")}
                  <span aria-hidden> / {SECTION_TOTAL}</span>
                </span>
                <span className={proseRule} aria-hidden />
                <span>{s.kicker}</span>
              </aside>
              <div>
                <h2 className={proseHeading} data-cascade>
                  {s.heading}
                </h2>
                <div className={proseBody}>
                  {s.body.map((line, j) => (
                    <p
                      key={j}
                      className={line.emphasis ? proseEmphasis : proseLine}
                      data-cascade
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
                {s.demo ? <ReflowDemo /> : null}
              </div>
            </Cascade>
          </section>
        ))}
      </div>

      <section className={featuresSection}>
        <Cascade>
          <header className={featuresHeader}>
            <p className={featuresKicker} data-cascade>
              What&apos;s in it
            </p>
            <h2 className={featuresHeading} data-cascade>
              Four moving parts.
            </h2>
          </header>
        </Cascade>
        <div className={featuresList}>
          {FEATURES.map((f, i) => {
            const reversed = i % 2 === 1;
            const visual = (
              <div className={featureVisual} data-cascade>
                <FeatureVignette kind={f.kind} />
              </div>
            );
            const content = (
              <div className={featureContent}>
                <span className={featureIndex} data-cascade>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className={featureName} data-cascade>
                  {f.name}
                </h3>
                <p className={featureBody} data-cascade>
                  {f.body}
                </p>
              </div>
            );
            return (
              <Cascade key={f.name}>
                <article className={reversed ? featureRowReverse : featureRow}>
                  {reversed ? (
                    <>
                      {content}
                      {visual}
                    </>
                  ) : (
                    <>
                      {visual}
                      {content}
                    </>
                  )}
                </article>
              </Cascade>
            );
          })}
        </div>
      </section>

      <section className={closeSection}>
        <div className={closeCard}>
          <VectorField
            settings={{
              density: 1.0,
              speed: 0.55,
              strength: 1.15,
              mforce: 0.8,
            }}
          />
          <div className={closeScrim} aria-hidden />
          <Grain />
          <Cascade className={closeInner}>
            <h2 className={closeHeading}>Go live your week.</h2>
            <p className={closeBody}>
              Circadium handles the planning, so the hours go where your life
              actually points.
            </p>
            <div className={closeActions}>
              <Button variant="solidLight" size="lg" onClick={goRegister}>
                Build your first week →
              </Button>
            </div>
            <p className={closeNote}>
              Free while in beta. Your data stays yours.
            </p>
          </Cascade>
        </div>
      </section>

      <footer className={footer}>
        <span>© {new Date().getFullYear()} Circadium</span>
        <div className={footerLinks}>
          <Link href="#" className={footerLink}>
            Terms
          </Link>
          <Link href="/privacy" className={footerLink}>
            Privacy
          </Link>
          <Link href="#" className={footerLink}>
            Contact
          </Link>
        </div>
      </footer>
    </main>
  );
}

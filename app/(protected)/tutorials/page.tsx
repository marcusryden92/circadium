"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  GraduationCap,
} from "lucide-react";
import { listRow } from "@/lib/theme";
import { PageHeader, BottomSheet } from "@/components/ui";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  TUTORIAL_SECTIONS,
  TUTORIAL_ARTICLES,
  findArticleIndex,
} from "./_lib/tutorials";
import { ArticleBody } from "./_components/ArticleBody";
import {
  page,
  mainGrid,
  rail,
  railHeader,
  railToggle,
  railToggleIcon,
  railScroll,
  railSection,
  railSectionHead,
  railRow,
  railRowActive,
  railRowNumber,
  railRowLabel,
  mainCard,
  articleScroll,
  articleInner,
  articleKicker,
  articleTitle,
  articleSummary,
  articleDivider,
  pager,
  pagerButton,
  pagerButtonNext,
  pagerDir,
  pagerTitle,
  scopeRow,
  scopePill,
  scopePillLabel,
  scopePillChevron,
  sheetList,
  sheetSectionHead,
  sheetRow,
  sheetRowActive,
  sheetRowNumber,
} from "./page.css";

const RAIL_COLLAPSE_KEY = "circadium.tutorials.railCollapsed";
const FIRST_SLUG = TUTORIAL_ARTICLES[0].slug;

// Ordinal shown against each article in the rail — a single running count
// across every section so the reader sees the intended reading order.
const ORDINAL_BY_SLUG = new Map(
  TUTORIAL_ARTICLES.map((a, i) => [a.slug, i + 1]),
);

function readHashSlug(): string | null {
  if (typeof window === "undefined") return null;
  const slug = window.location.hash.replace(/^#/, "");
  return slug && findArticleIndex(slug) !== -1 ? slug : null;
}

export default function TutorialsPage() {
  const isMobile = useIsMobile();
  const [activeSlug, setActiveSlug] = useState(FIRST_SLUG);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [railCollapsed, setRailCollapsed] = useState(false);
  const [railHydrated, setRailHydrated] = useState(false);
  const [railTransitionsReady, setRailTransitionsReady] = useState(false);

  useLayoutEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_COLLAPSE_KEY) === "1") {
        setRailCollapsed(true);
      }
    } catch {
      // localStorage may be unavailable (private mode, disabled cookies)
    }
    setRailHydrated(true);
    const id = requestAnimationFrame(() => setRailTransitionsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    if (!railHydrated) return;
    try {
      window.localStorage.setItem(RAIL_COLLAPSE_KEY, railCollapsed ? "1" : "0");
    } catch {
      // localStorage may be unavailable (private mode, quota exceeded)
    }
  }, [railCollapsed, railHydrated]);

  // Deep-link via #slug, and keep the browser back button meaningful as the
  // reader moves between articles.
  useEffect(() => {
    const fromHash = readHashSlug();
    if (fromHash) setActiveSlug(fromHash);
    const onHashChange = () => {
      const slug = readHashSlug();
      if (slug) setActiveSlug(slug);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeIndex = findArticleIndex(activeSlug);
  const article = TUTORIAL_ARTICLES[activeIndex] ?? TUTORIAL_ARTICLES[0];
  const prev = activeIndex > 0 ? TUTORIAL_ARTICLES[activeIndex - 1] : null;
  const next =
    activeIndex < TUTORIAL_ARTICLES.length - 1
      ? TUTORIAL_ARTICLES[activeIndex + 1]
      : null;

  const goTo = useCallback((slug: string) => {
    setActiveSlug(slug);
    setPickerOpen(false);
    try {
      window.location.hash = slug;
    } catch {
      // hash assignment can throw in sandboxed frames; state still updates
    }
    // Reset the reading pane to the top when switching articles.
    const scroller = document.getElementById("tutorial-scroll");
    if (scroller) scroller.scrollTo({ top: 0 });
  }, []);

  return (
    <div
      className={page}
      data-rail-collapsed={railCollapsed}
      data-no-transitions={railTransitionsReady ? undefined : "true"}
    >
      <PageHeader
        title="Tutorials"
        summary={
          <>
            {TUTORIAL_ARTICLES.length} guides · from the big picture to the
            details
          </>
        }
      />

      <div className={mainGrid}>
        {!isMobile && (
          <aside className={rail}>
            <div className={railHeader}>
              <button
                type="button"
                className={railToggle}
                onClick={() => setRailCollapsed((c) => !c)}
                title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={
                  railCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                aria-expanded={!railCollapsed}
              >
                <span className={railToggleIcon} aria-hidden>
                  <ChevronLeft size={16} strokeWidth={2} />
                </span>
              </button>
            </div>
            <div className={railScroll}>
              {TUTORIAL_SECTIONS.map((section) => (
                <div key={section.title} className={railSection}>
                  <div className={railSectionHead}>{section.title}</div>
                  {section.articles.map((a) => {
                    const active = a.slug === activeSlug;
                    return (
                      <button
                        key={a.slug}
                        className={`${listRow()} ${railRow} ${active ? railRowActive : ""}`}
                        onClick={() => goTo(a.slug)}
                        aria-current={active ? "true" : undefined}
                      >
                        <span className={railRowNumber}>
                          {ORDINAL_BY_SLUG.get(a.slug)}
                        </span>
                        <span className={railRowLabel}>{a.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
        )}

        <section className={mainCard}>
          {isMobile && (
            <div className={scopeRow}>
              <button
                type="button"
                className={scopePill}
                onClick={() => setPickerOpen(true)}
                aria-haspopup="dialog"
              >
                <GraduationCap size={15} strokeWidth={2} aria-hidden />
                <span className={scopePillLabel}>{article.title}</span>
                <span className={scopePillChevron} aria-hidden>
                  <ChevronDown size={14} strokeWidth={2.2} />
                </span>
              </button>
            </div>
          )}

          <div className={articleScroll} id="tutorial-scroll">
            <article className={articleInner}>
              <div className={articleKicker}>
                Guide {activeIndex + 1} of {TUTORIAL_ARTICLES.length}
              </div>
              <h1 className={articleTitle}>{article.title}</h1>
              <p className={articleSummary}>{article.summary}</p>
              <div className={articleDivider} />

              <ArticleBody blocks={article.blocks} />

              <div className={pager}>
                {prev ? (
                  <button
                    type="button"
                    className={pagerButton}
                    onClick={() => goTo(prev.slug)}
                  >
                    <span className={pagerDir}>
                      <ArrowLeft size={13} strokeWidth={2} aria-hidden />
                      Previous
                    </span>
                    <span className={pagerTitle}>{prev.title}</span>
                  </button>
                ) : (
                  <span />
                )}
                {next ? (
                  <button
                    type="button"
                    className={`${pagerButton} ${pagerButtonNext}`}
                    onClick={() => goTo(next.slug)}
                  >
                    <span className={pagerDir}>
                      Next
                      <ArrowRight size={13} strokeWidth={2} aria-hidden />
                    </span>
                    <span className={pagerTitle}>{next.title}</span>
                  </button>
                ) : (
                  <span />
                )}
              </div>
            </article>
          </div>
        </section>
      </div>

      {isMobile && (
        <BottomSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Tutorials"
        >
          <div className={sheetList}>
            {TUTORIAL_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className={sheetSectionHead}>{section.title}</div>
                {section.articles.map((a) => {
                  const active = a.slug === activeSlug;
                  return (
                    <button
                      key={a.slug}
                      className={`${sheetRow} ${active ? sheetRowActive : ""}`}
                      onClick={() => goTo(a.slug)}
                      aria-current={active ? "true" : undefined}
                    >
                      <span className={sheetRowNumber}>
                        {ORDINAL_BY_SLUG.get(a.slug)}
                      </span>
                      {a.title}
                      {active && <ChevronRight size={15} strokeWidth={2} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

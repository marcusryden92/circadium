"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { assignInlineVars } from "@vanilla-extract/dynamic";
import { themeLight, themeDark, vars, type ThemeVars } from "@/lib/theme";

export type ThemeName = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeName;
  dark: boolean;
  toggle: () => void;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// The preference is stored per user (`theme.dark.<userId>`) so accounts
// sharing a browser keep their own theme; the unscoped key serves logged-out
// surfaces and doubles as the pre-scoping fallback a signed-in user reads
// once before their scoped value exists.
const STORAGE_KEY = "theme.dark";

type UserVarOverrides = Parameters<typeof assignInlineVars<ThemeVars>>[1];

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: ThemeName;
  userVars?: UserVarOverrides;
};

export function ThemeProvider({
  children,
  defaultTheme = "light",
  userVars,
}: ThemeProviderProps) {
  // The root layout passes the server session into SessionProvider, so the
  // user id is available synchronously on the first client render — the
  // scoped key is read before the first paint-affecting effect, no theme
  // flash on login.
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const storageKey = userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY;

  const [dark, setDark] = useState(defaultTheme === "dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored =
        window.localStorage.getItem(storageKey) ??
        window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setDark(true);
      else if (stored === "0") setDark(false);
    } catch {
      // localStorage unavailable; keep default
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, dark ? "1" : "0");
    } catch {
      // ignore
    }
  }, [dark, hydrated, storageKey]);

  useEffect(() => {
    const body = document.body;
    const next = dark ? themeDark : themeLight;
    body.classList.remove(themeLight, themeDark);
    body.classList.add(next);
    return () => {
      body.classList.remove(next);
    };
  }, [dark]);

  const toggle = useCallback(() => setDark((d) => !d), []);
  const setTheme = useCallback(
    (t: ThemeName) => setDark(t === "dark"),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: dark ? "dark" : "light",
      dark,
      toggle,
      setTheme,
    }),
    [dark, toggle, setTheme],
  );

  const themeClass = dark ? themeDark : themeLight;

  const overrideStyle: CSSProperties | undefined = useMemo(() => {
    if (!userVars) return undefined;
    return assignInlineVars(vars, userVars) as CSSProperties;
  }, [userVars]);

  return (
    <ThemeContext.Provider value={value}>
      <div
        className={themeClass}
        data-theme={dark ? "dark" : "light"}
        style={{ display: "contents", ...overrideStyle }}
        suppressHydrationWarning
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    theme: "light",
    dark: false,
    toggle: () => {},
    setTheme: () => {},
  };
}

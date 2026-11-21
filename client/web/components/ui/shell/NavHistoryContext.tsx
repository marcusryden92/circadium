"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const NavHistoryContext = createContext<string | null>(null);

// Remembers the previously visited route inside the shell. Canvas routes
// (graph, mindmap) replace the mobile tab bar with a back button, and
// router.back() would leave the app on a deep link or after a refresh — the
// button pushes this tracked route instead, with a dashboard fallback.
export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [previous, setPrevious] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);

  useEffect(() => {
    const current = currentRef.current;
    if (current !== null && current !== pathname) setPrevious(current);
    currentRef.current = pathname;
  }, [pathname]);

  return (
    <NavHistoryContext.Provider value={previous}>
      {children}
    </NavHistoryContext.Provider>
  );
}

export function usePreviousPathname(): string | null {
  return useContext(NavHistoryContext);
}

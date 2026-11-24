"use client";

import { ReactNode, useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "@/lib/session/SessionProvider";
import { setUser } from "@/redux/slices/userSlice";
import { User } from "@/types/user";
import React from "react";

// Scheduling settings, locations and travel times all arrive with the
// calendar bootstrap (useFetchCalendarData seeds the slices; plan 2.1), so
// this provider only mirrors the session user into Redux.
export default function UserProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const user: User | undefined = session?.user;

  useEffect(() => {
    if (status === "authenticated" && user) {
      dispatch(setUser(user));
    }
  }, [status, user, dispatch]);

  return <>{children}</>;
}

"use client";

import { ReactNode, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useSession } from "next-auth/react";
import { setUser } from "@/redux/slices/userSlice";
import {
  setSchedulingSettings,
  setAllTravelTimes,
  setDefaultTransportMode,
  setLocations,
} from "@/redux/slices/schedulingSettingsSlice";
import { fetchAllSchedulingData } from "@/actions/scheduling";
import { retry } from "@/lib/retry";
import { normalizeWeekStartDay } from "@/utils/calendarUtils";
import { readInspectionTarget } from "@/utils/inspection";
import { User } from "@/types/user";
import React from "react";

export default function UserProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const user: User | undefined = session?.user;

  // NextAuth refetches the session on every window focus, handing down a new
  // `user` object with identical data. Keying the account-scoped fetch below on
  // this ref (not the object reference) stops a tab refocus from re-fetching
  // scheduling settings and bumping setAllTravelTimes/setDefaultTransportMode —
  // which otherwise cascade into CalendarProvider's settings-regen effect and
  // trigger a full engine regen (that could clobber an unsynced edit).
  const hydratedSchedulingForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user) {
      dispatch(setUser(user));

      // Snapshot impersonation hydrates these slices from the stored report
      // instead — loading the admin's own rows here would race and overwrite.
      if (readInspectionTarget()) return;

      if (!user.id) return;
      if (hydratedSchedulingForUserRef.current === user.id) return;
      hydratedSchedulingForUserRef.current = user.id;

      // Load user's scheduling settings, travel times, and locations.
      // Retry through a cold-start window so these don't silently fail to load
      // until a manual refresh; a persistent failure degrades to defaults.
      retry(() => fetchAllSchedulingData())
        .then((data) => {
          dispatch(
            setSchedulingSettings({
              bufferTimeMinutes: data.preferences.bufferTimeMinutes,
              weekStartDay: normalizeWeekStartDay(data.preferences.weekStartDay),
            })
          );
          dispatch(
            setDefaultTransportMode(data.preferences.defaultTransportMode)
          );
          dispatch(setAllTravelTimes(data.allTravelTimes));
          dispatch(setLocations(data.locations));
        })
        .catch(() => {
          // Scheduling settings fall back to slice defaults until the next load.
          // Clear the guard so a later focus/remount can re-attempt the fetch
          // rather than being permanently blocked by the optimistic mark.
          hydratedSchedulingForUserRef.current = null;
        });
    }
  }, [status, user, dispatch]);

  return <>{children}</>;
}

"use client";

import { ReactNode, useEffect } from "react";
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
import { User } from "@/types/user";
import React from "react";

export default function UserProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch();
  const { data: session, status } = useSession();
  const user: User | undefined = session?.user;

  useEffect(() => {
    if (status === "authenticated" && user) {
      dispatch(setUser(user));

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
        });
    }
  }, [status, user, dispatch]);

  return <>{children}</>;
}

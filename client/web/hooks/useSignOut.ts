"use client";

import { useCallback, useRef } from "react";
import { useDispatch } from "react-redux";

import { describeApiError } from "@/lib/api/errorMessage";
import { useSession } from "@/lib/session/SessionProvider";
import { signOut } from "@/lib/session/signOut";
import { pushToast } from "@/redux/slices/toastSlice";

/**
 * Signs out, or says why it could not. A failed sign-out leaves the cookies
 * live, so the user has to know they are still signed in (on a shared
 * computer, the next person would be too). A sign-out that works also clears
 * this account's data from the device.
 */
export function useSignOut(): () => void {
  const dispatch = useDispatch();
  const { data: session } = useSession();
  const userId = session?.user.id;
  const inFlight = useRef(false);

  return useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    signOut({ userId }).catch((error: unknown) => {
      inFlight.current = false;
      dispatch(
        pushToast(`You are still signed in. ${describeApiError(error)}`),
      );
    });
  }, [dispatch, userId]);
}

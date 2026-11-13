"use client";

import { ReactNode } from "react";
import { Provider } from "react-redux";
import store from "@/redux/store";
import React from "react";
// Side effect: injects the web worker factory into the shared engine client so
// off-main-thread regen is available before any store-dispatched engine run.
import "@/lib/engineWorker";

export default function StoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}

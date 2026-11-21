"use client";

import { useEffect, useRef, useState } from "react";
import * as locationActions from "@/actions/locations";

export interface Prediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}

interface UsePlaceSearchArgs {
  query: string;
  sessionToken: string | null;
  // When true, the query is treated as already resolved (user picked a result)
  // or unchanged from the original address, and no search runs.
  skip: boolean;
  debounceMs?: number;
}

interface UsePlaceSearchResult {
  predictions: Prediction[];
  searching: boolean;
  clear: () => void;
}

export function usePlaceSearch({
  query,
  sessionToken,
  skip,
  debounceMs = 300,
}: UsePlaceSearchArgs): UsePlaceSearchResult {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (skip || !query || query.length < 2) {
      setPredictions([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const results = await locationActions.searchPlaces(
          query,
          sessionToken ?? undefined,
        );
        setPredictions(results);
      } catch (err) {
        console.error("Place search failed:", err);
      } finally {
        setSearching(false);
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, sessionToken, skip, debounceMs]);

  return {
    predictions,
    searching,
    clear: () => setPredictions([]),
  };
}

"use client";
import { useEffect, useRef } from "react";

/** One automatic cost check per complete selection. Failures require explicit retry. */
export function useAutomaticQuote(
  enabled: boolean,
  valid: boolean,
  selection: string,
  preview: () => Promise<void>,
) {
  const latest = useRef(preview);
  latest.current = preview;
  useEffect(() => {
    if (!enabled || !valid) return;
    // Defer so Strict Mode's discarded setup cannot abort the only request.
    const timer = setTimeout(() => void latest.current(), 0);
    return () => clearTimeout(timer);
  }, [enabled, valid, selection]);
}

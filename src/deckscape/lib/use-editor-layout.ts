"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

export type EditorLayout = "columns" | "drawer";
const preferenceKey = "deckscape:editor-layout";
const query = "(max-width: 800px)";
const subscribe = (notify: () => void) => {
  const media = matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => matchMedia(query).matches;
const serverSnapshot = () => false;

export function useEditorLayout() {
  const mobile = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [preference, setPreference] = useState<EditorLayout>("columns");
  useEffect(() => {
    try {
      if (localStorage.getItem(preferenceKey) === "drawer")
        setPreference("drawer");
    } catch {
      /* The in-memory preference remains usable. */
    }
  }, []);
  function chooseLayout(value: EditorLayout) {
    setPreference(value);
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      /* Session only. */
    }
  }
  return {
    drawer: mobile || preference === "drawer",
    preference,
    chooseLayout,
  };
}

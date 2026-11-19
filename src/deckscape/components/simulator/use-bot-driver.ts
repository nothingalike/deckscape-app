"use client";
import { useEffect, useState } from "react";

/** Execution pauses when the page is hidden; stored games resume through the normal simulator. */
export function useBotDriver(roomId?: string) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!roomId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (controller.signal.aborted) return;
      try {
        if (document.visibilityState !== "hidden") {
          const result = await window.neuroscape.advanceMatchBot(roomId);
          if (controller.signal.aborted) return;
          if (!result.ok) throw new Error(result.error.message);
          setError("");
          if (result.data.finished) return;
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Bot game unavailable.");
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [roomId]);
  return error;
}

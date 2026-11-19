"use client";
import { useLayoutEffect, useRef } from "react";

// Each presentation has a different scroll container. Retain its position when
// switching back, without remounting the catalog or changing its search state.
export function useCatalogScroll(drawer: boolean) {
  const ref = useRef<HTMLElement>(null);
  const positions = useRef({ columns: 0, drawer: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const mode = drawer ? "drawer" : "columns";
    if (drawer)
      window.scrollTo({ top: positions.current.drawer, behavior: "instant" });
    else node.scrollTop = positions.current.columns;
    const target = drawer ? window : node;
    const remember = () => {
      // Dialogs temporarily fix the body at the saved page position.
      if (document.body.style.position === "fixed") return;
      positions.current[mode] = drawer ? window.scrollY : node.scrollTop;
    };
    target.addEventListener("scroll", remember, { passive: true });
    return () => target.removeEventListener("scroll", remember);
  }, [drawer]);
  return ref;
}

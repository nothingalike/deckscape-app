"use client";

import { useEffect, useRef } from "react";
import styles from "./landscape-prompt.module.css";

// Use available layout space and primary input, not user-agent sniffing.
const phonePortrait =
  "(max-width: 600px) and (orientation: portrait) and (pointer: coarse) and (hover: none)";

export function LandscapePrompt({ active }: { active: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const query = window.matchMedia(phonePortrait);
    const synchronize = () => {
      if (active && query.matches) {
        if (!element.open) element.showModal();
      } else if (element.open) element.close();
    };
    synchronize();
    query.addEventListener("change", synchronize);
    return () => {
      query.removeEventListener("change", synchronize);
      if (element.open) element.close();
    };
  }, [active]);

  return (
    <dialog
      ref={dialog}
      className={styles.prompt}
      aria-labelledby="landscape-prompt-title"
      aria-describedby="landscape-prompt-description"
      tabIndex={-1}
      onCancel={(event) => event.preventDefault()}
    >
      <svg aria-hidden="true" viewBox="0 0 80 80" width="80" height="80">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <rect
            x="25"
            y="15"
            width="30"
            height="50"
            rx="5"
            transform="rotate(30 40 40)"
          />
          <path d="M12 35a29 29 0 0 1 44-20m-1-9 3 11-11 1M68 45a29 29 0 0 1-44 20m1 9-3-11 11-1" />
        </g>
      </svg>
      <h2 id="landscape-prompt-title">Rotate your phone to play</h2>
      <p id="landscape-prompt-description">
        Turn your phone sideways for the full battlefield. Your match stays open
        and continues while you rotate.
      </p>
    </dialog>
  );
}

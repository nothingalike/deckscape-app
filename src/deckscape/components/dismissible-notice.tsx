"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const dismissedThisSession = new Set<string>();

export function DismissibleNotice({
  noticeId,
  label,
  className = "",
  children,
}: {
  noticeId: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const storageKey = `deckscape:notice-dismissed:${noticeId}`;

  useEffect(() => {
    let dismissed = dismissedThisSession.has(storageKey);
    try {
      dismissed ||= sessionStorage.getItem(storageKey) === "true";
    } catch {
      // Keep dismissal working during navigation when storage is unavailable.
    }
    setVisible(!dismissed);
  }, [storageKey]);

  function dismiss() {
    dismissedThisSession.add(storageKey);
    setVisible(false);
    try {
      sessionStorage.setItem(storageKey, "true");
    } catch {
      // The in-memory fallback still applies for this page session.
    }
  }

  if (!visible) return null;

  return (
    <aside
      className={`notice dismissible-notice ${className}`}
      aria-label={label}
    >
      <div>{children}</div>
      <button
        type="button"
        className="icon-button notice-dismiss"
        aria-label={`Dismiss ${label.toLowerCase()}`}
        onClick={dismiss}
      >
        <X size={18} />
      </button>
    </aside>
  );
}

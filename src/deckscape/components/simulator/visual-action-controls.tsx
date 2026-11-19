"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBoardInteraction } from "./board-interaction";

const LegacyForms = createContext(false);
const InlineConfirmationContext = createContext(false);
/** Explicit card-play modals keep confirmation with their own choices. */
export function InlineConfirmation({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  return (
    <InlineConfirmationContext.Provider value={enabled}>
      {children}
    </InlineConfirmationContext.Provider>
  );
}
export const useLegacyForms = () => useContext(LegacyForms);
/** SIM_FORM_FALLBACK: explicit comparison/test harness only; never mounted by the match. */
export function LegacyFormPreview({ children }: { children: ReactNode }) {
  return <LegacyForms.Provider value={true}>{children}</LegacyForms.Provider>;
}

export function FormFallback({ children }: { children: ReactNode }) {
  const explicitlyEnabled = useContext(LegacyForms);
  if (explicitlyEnabled) return <>{children}</>;
  // SIM_FORM_FALLBACK: Redundant card selectors/checkbox forms are temporarily
  // disabled during cards-only testing. Restore the return below to compare;
  // after visual acceptance, delete these marked wrappers AND their form JSX.
  // return <>{children}</>;
  return null;
}

export function ActionConfirmation({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const board = useBoardInteraction();
  const inline = useContext(InlineConfirmationContext);
  const explicitlyEnabled = useContext(LegacyForms);
  if (inline) return <>{children}</>;
  if (!board) return explicitlyEnabled ? <>{children}</> : null;
  return board.confirmationHost
    ? createPortal(
        <fieldset
          disabled={board.disabled || disabled}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          {children}
        </fieldset>,
        board.confirmationHost,
      )
    : null;
}

export function ConfirmationDock() {
  const board = useBoardInteraction();
  return (
    <div
      ref={board?.setConfirmationHost}
      aria-label="Confirm selected action"
    />
  );
}

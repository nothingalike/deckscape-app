"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Picker = {
  guided?: boolean;
  required?: number;
  key: string;
  label: string;
  candidates: string[];
  selected: string[];
  choose: (id: string) => void;
};
type Interaction = {
  decoration: BoardDecorationValue;
  setDecoration: React.Dispatch<React.SetStateAction<BoardDecorationValue>>;
  programSlot: string | null;
  setProgramSlot: React.Dispatch<React.SetStateAction<string | null>>;
  confirmationHost: HTMLDivElement | null;
  setConfirmationHost: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >;
  disabled: boolean;
  picker: Picker | null;
  setPicker: React.Dispatch<React.SetStateAction<Picker | null>>;
};
const Context = createContext<Interaction | null>(null);
export type BoardIntentLink = {
  draft?: boolean;
  from: string;
  to: string;
  label?: string;
  kind?: "assignment" | "target";
};
type BoardDecorationValue = {
  selected: string[];
  links: BoardIntentLink[];
};
const emptyDecoration: BoardDecorationValue = { selected: [], links: [] };
export const useBoardInteraction = () => useContext(Context);

export function BoardInteractionProvider({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const [confirmationHost, setConfirmationHost] =
    useState<HTMLDivElement | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [programSlot, setProgramSlot] = useState<string | null>(null);
  const [decoration, setDecoration] = useState(emptyDecoration);
  return (
    <Context.Provider
      value={{
        decoration,
        setDecoration,
        programSlot,
        setProgramSlot,
        picker,
        setPicker,
        confirmationHost,
        setConfirmationHost,
        disabled,
      }}
    >
      {children}
    </Context.Provider>
  );
}

/** Keep assignment highlights visible while a later picker is active. */
export function BoardDecoration({
  selected = [],
  links = [],
}: Partial<BoardDecorationValue>) {
  const setDecoration = useBoardInteraction()?.setDecoration;
  const signature = JSON.stringify({ selected, links });
  useEffect(() => {
    setDecoration?.(JSON.parse(signature));
    return () => setDecoration?.(emptyDecoration);
  }, [signature, setDecoration]);
  return null;
}

/** The form owns the selection and validation; the board is another input for it. */
export function BoardChoice({
  label,
  candidates,
  selected,
  onChoose,
  disabled = false,
  active,
  required,
}: {
  active?: boolean;
  required?: number;
  label: string;
  candidates: string[];
  selected: string[];
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  const context = useBoardInteraction();
  const key = useId();
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const setPicker = context?.setPicker;
  const signature = JSON.stringify([
    label,
    candidates,
    selected,
    disabled,
    active,
    required,
  ]);
  useEffect(() => {
    setPicker?.((current) =>
      active === true && !disabled
        ? {
            key,
            guided: true,
            required,
            label,
            candidates,
            selected,
            choose: (id) => choose.current(id),
          }
        : current?.key === key
          ? disabled ||
            active === false ||
            (active === undefined && current.guided)
            ? null
            : { ...current, label, candidates, selected }
          : current,
    );
    // The signature tracks values rather than freshly allocated arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, key, setPicker]);
  useEffect(
    () => () => {
      setPicker?.((current) => (current?.key === key ? null : current));
    },
    [key, setPicker],
  );
  if (!context) return null;
  if (active !== undefined)
    return (
      <p role={active ? "status" : undefined}>
        {label}: {selected.length}
        {required === undefined ? "" : `/${required}`} selected
        {active ? " — click highlighted cards to select or deselect." : ""}
      </p>
    );
  return (
    <button
      type="button"
      disabled={disabled || !candidates.length}
      aria-pressed={context.picker?.key === key}
      onClick={() =>
        setPicker?.((current) =>
          current?.key === key
            ? null
            : {
                key,
                label,
                candidates,
                selected,
                choose: (id) => choose.current(id),
              },
        )
      }
    >
      {context.picker?.key === key
        ? "Finish board selection"
        : `Choose on board: ${label}`}
    </button>
  );
}

"use client";
import { Children, isValidElement, type ReactNode } from "react";
import { FormFallback } from "./visual-action-controls";
import styles from "./compact-choices.module.css";

/** Named choices stay explicit; selecting one never submits the action. */
export function ChoiceButtons({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.group}>
      <p>{label}</p>
      <div
        role="group"
        aria-label={label + " choices"}
        className={styles.buttons}
      >
        {Children.toArray(children).map((child) => {
          if (
            !isValidElement<{
              value: string | number;
              children: ReactNode;
              disabled?: boolean;
            }>(child)
          )
            return null;
          const option = child.props;
          if (option.value === "") return null;
          return (
            <button
              type="button"
              key={String(option.value)}
              disabled={option.disabled}
              aria-pressed={String(value) === String(option.value)}
              onClick={() => onChange(String(option.value))}
            >
              {option.children}
            </button>
          );
        })}
      </div>
      <FormFallback>
        {/* SIM_FORM_FALLBACK: compact buttons replace named-choice dropdowns. */}
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
      </FormFallback>
    </div>
  );
}

export function AmountChoice({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max: number;
}) {
  const amount = value === "" ? null : Number(value);
  return (
    <div role="group" aria-label={label + " amount"} className={styles.amount}>
      <span>{label}</span>
      <button
        type="button"
        aria-label={"Decrease " + label}
        disabled={amount !== null && amount <= min}
        onClick={() =>
          onChange(String(amount === null ? min : Math.max(min, amount - 1)))
        }
      >
        −
      </button>
      <output aria-label={label + " value"}>
        {value === "" ? "Choose" : value}
      </output>
      <button
        type="button"
        aria-label={"Increase " + label}
        disabled={amount !== null && amount >= max}
        onClick={() =>
          onChange(String(amount === null ? min : Math.min(max, amount + 1)))
        }
      >
        +
      </button>
      <FormFallback>
        {/* SIM_FORM_FALLBACK: numeric inputs retained for comparison. */}
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormFallback>
    </div>
  );
}

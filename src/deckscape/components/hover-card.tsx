"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Card } from "@/lib/types";
import { CardArt } from "./card-art";
export function HoverCard({
  card,
  children,
}: {
  card: Card;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPosition(null);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!position) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  return (
    <span
      className="hover-card-trigger"
      onPointerEnter={(e) => {
        if (
          e.pointerType !== "mouse" ||
          !matchMedia("(hover: hover) and (pointer: fine)").matches
        )
          return;
        const rect = e.currentTarget.getBoundingClientRect();
        const width = Math.min(320, (window.innerHeight - 80) * 0.7);
        const left =
          rect.right + 16 + width < window.innerWidth
            ? rect.right + 16
            : Math.max(12, rect.left - width - 16);
        const top = Math.max(
          12,
          Math.min(rect.top, window.innerHeight - width / 0.7 - 60),
        );
        timer.current = setTimeout(
          () => setPosition({ left, top, width }),
          300,
        );
      }}
      onPointerLeave={close}
      onPointerDown={close}
    >
      {children}
      {position &&
        createPortal(
          <div
            className="card-hover-preview"
            style={position}
            aria-hidden="true"
          >
            <CardArt card={card} />
            <strong>{card.name}</strong>
            <small>
              {card.set_code} · {card.collector_number}
            </small>
          </div>,
          document.body,
        )}
    </span>
  );
}

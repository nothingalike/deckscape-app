"use client";
import { useEffect, useRef } from "react";

type DialogEntry = {
  node: HTMLDivElement;
  layer: HTMLElement;
  previous: HTMLElement | null;
  zIndex: string;
};
const stack: DialogEntry[] = [];
const isolated = new Map<HTMLElement, boolean>();
let unlock: (() => void) | undefined;

function isolateTop() {
  for (const [element, inert] of isolated) element.inert = inert;
  isolated.clear();
  const top = stack.at(-1);
  if (!top) return;
  // Isolate siblings along the path, never an ancestor of the active layer.
  let branch: HTMLElement = top.layer;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) {
        isolated.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
}

function controls(node: HTMLElement) {
  return [
    ...node.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    ),
  ].filter(
    (element) => element.getClientRects().length && !element.closest("[inert]"),
  );
}

export function useDialog(open: boolean, onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const node = ref.current;
    const layer =
      node.closest<HTMLElement>("[data-dialog-layer], .modal-backdrop") ?? node;
    const entry: DialogEntry = {
      node,
      layer,
      previous: document.activeElement as HTMLElement | null,
      zIndex: layer.style.zIndex,
    };
    if (!stack.length) {
      const body = document.body;
      const saved = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      const x = window.scrollX,
        y = window.scrollY;
      Object.assign(body.style, {
        position: "fixed",
        top: `${-y}px`,
        left: `${-x}px`,
        width: "100%",
        overflow: "hidden",
      });
      unlock = () => {
        Object.assign(body.style, saved);
        window.scrollTo({ left: x, top: y, behavior: "instant" });
      };
    }
    stack.push(entry);
    layer.style.zIndex = String(1000 + stack.length * 10);
    isolateTop();
    (controls(node)[0] ?? node).focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (stack.at(-1) !== entry) return;
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = controls(node),
        first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        node.focus();
        return;
      }
      if (
        !node.contains(document.activeElement) ||
        (event.shiftKey &&
          (document.activeElement === first || document.activeElement === node))
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => {
      document.removeEventListener("keydown", trap, true);
      const wasTop = stack.at(-1) === entry;
      stack.splice(stack.indexOf(entry), 1);
      layer.style.zIndex = entry.zIndex;
      isolateTop();
      if (!stack.length) {
        unlock?.();
        unlock = undefined;
      }
      if (wasTop) {
        const previous = entry.previous;
        if (
          previous?.isConnected &&
          !previous.closest("[inert]") &&
          previous.getClientRects().length
        )
          previous.focus({ preventScroll: true });
        else {
          const next = stack.at(-1)?.node;
          if (next) (controls(next)[0] ?? next).focus({ preventScroll: true });
        }
      }
    };
  }, [open]);
  return ref;
}

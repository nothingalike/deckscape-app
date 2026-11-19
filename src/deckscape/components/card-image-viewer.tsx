"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import styles from "./card-image-viewer.module.css";

export function CardImageViewer({
  name,
  onClose,
  children,
}: {
  name: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useDialog(true, onClose);
  return createPortal(
    <div
      className={styles.backdrop}
      data-dialog-layer
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Enlarged ${name}`}
        className={styles.viewer}
        tabIndex={-1}
      >
        <button
          type="button"
          className={`secondary ${styles.close}`}
          aria-label="Close enlarged card"
          onClick={onClose}
        >
          <X size={18} /> Close
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

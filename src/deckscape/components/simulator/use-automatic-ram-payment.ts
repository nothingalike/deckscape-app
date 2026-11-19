"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { proposeAutomaticRamPayment } from "@/lib/simulator/automatic-ram-payment";

export function useAutomaticRamPayment({
  paymentIdentity,
  cost,
  candidates,
  available,
  setRam,
}: {
  paymentIdentity: string;
  cost: number;
  candidates: readonly string[];
  available: boolean;
  setRam: Dispatch<SetStateAction<string[]>>;
}) {
  const candidateIdentity = JSON.stringify(candidates);

  useEffect(() => {
    setRam(
      available ? (proposeAutomaticRamPayment(candidates, cost) ?? []) : [],
    );
  }, [available, candidateIdentity, cost, paymentIdentity, setRam]);
}

import { z } from "zod";
import {
  battlefieldResponseSchema,
  commandResponseSchema,
} from "./battlefield-response";
import type { MatchTransport } from "./match-client-session";
import {
  programQuoteRequestSchema,
  programQuoteResponseSchema,
  type ProgramQuoteRequest,
  type ProgramQuote,
} from "./program-quote-contract";
import {
  activationQuoteRequestSchema,
  activationQuoteResponseSchema,
  type ActivationQuote,
  type ActivationQuoteRequest,
} from "./activation-quote-contract";

export interface ActivationQuoteTransport {
  quoteActivation(
    input: ActivationQuoteRequest,
    signal: AbortSignal,
  ): Promise<ActivationQuote>;
}

export interface ProgramQuoteTransport {
  quoteProgram(
    input: ProgramQuoteRequest,
    signal: AbortSignal,
  ): Promise<ProgramQuote>;
}

/** A definitive rejection requires a valid application envelope. HTTP failures and
 * malformed responses leave delivery uncertain and retain the coordinator's command ID.
 */
export function createHttpMatchTransport(
  matchId: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
): MatchTransport & ProgramQuoteTransport & ActivationQuoteTransport {
  z.uuid().parse(matchId);
  z.number().int().min(1).max(60000).parse(timeoutMs);
  const url = `/api/simulator/matches/${matchId}`;
  const request = (
    signal: AbortSignal,
    options: RequestInit = {},
    suffix = "",
  ) =>
    fetcher(url + suffix, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  return {
    async quoteActivation(input, signal) {
      const selection = activationQuoteRequestSchema.parse(input);
      const response = await request(
        signal,
        { method: "POST", body: JSON.stringify(selection) },
        "/activation-quote",
      );
      if (!response.ok) throw new Error("Activation choices unavailable");
      const body = activationQuoteResponseSchema.parse(await response.json());
      if (
        body.matchId !== matchId ||
        JSON.stringify(body.quote.request) !== JSON.stringify(selection)
      )
        throw new Error("Unexpected activation quote");
      return body.quote;
    },
    async quoteProgram(input, signal) {
      const selection = programQuoteRequestSchema.parse(input);
      const response = await request(
        signal,
        { method: "POST", body: JSON.stringify(selection) },
        "/program-quote",
      );
      if (!response.ok) throw new Error("Program choices unavailable");
      const body = programQuoteResponseSchema.parse(await response.json());
      if (
        body.matchId !== matchId ||
        JSON.stringify(body.quote.request) !== JSON.stringify(selection)
      )
        throw new Error("Unexpected program quote");
      return body.quote;
    },
    async read(signal) {
      const response = await request(signal);
      if (!response.ok) throw new Error("Match read unavailable");
      const body = battlefieldResponseSchema.parse(await response.json());
      if (body.matchId !== matchId)
        throw new Error("Unexpected match response");
      return body.snapshot;
    },
    async send(commandId, command, signal) {
      z.uuid().parse(commandId);
      const response = await request(signal, {
        method: "POST",
        body: JSON.stringify({ commandId, command }),
      });
      if (!response.ok) throw new Error("Command delivery unconfirmed");
      const body = commandResponseSchema.parse(await response.json());
      if (body.matchId !== matchId || body.commandId !== commandId)
        throw new Error("Unexpected command receipt");
      return body.status === "accepted"
        ? { status: "accepted", acceptedRevision: body.acceptedRevision }
        : { status: "rejected", message: body.message };
    },
  };
}

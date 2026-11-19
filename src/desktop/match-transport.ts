import { battlefieldSnapshotSchema, commandResponseSchema } from '../deckscape/lib/simulator/battlefield-response';
import type { MatchTransport } from '../deckscape/lib/simulator/match-client-session';
import type { ProgramQuoteTransport, ActivationQuoteTransport } from '../deckscape/lib/simulator/http-match-transport';
import { programQuoteRequestSchema, programQuoteSchema } from '../deckscape/lib/simulator/program-quote-contract';
import { activationQuoteRequestSchema, activationQuoteSchema } from '../deckscape/lib/simulator/activation-quote-contract';

/** Keep the hosted coordinator's uncertain-delivery semantics across local IPC. */
export function createLocalMatchTransport(id: string): MatchTransport & ProgramQuoteTransport & ActivationQuoteTransport {
  return {
    async read(signal) {
      signal.throwIfAborted(); const result = await window.neuroscape.readMatch(id); signal.throwIfAborted();
      if (!result.ok) throw new Error(result.error.message);
      if (result.data.phase !== 'game') throw new Error('The match has not finished setup.');
      return battlefieldSnapshotSchema.parse(result.data.snapshot);
    },
    async send(commandId, command, signal) {
      signal.throwIfAborted(); const result = await window.neuroscape.submitMatch(id, commandId, command); signal.throwIfAborted();
      if (!result.ok) {
        if (['MATCH_REJECTED', 'INVALID_REQUEST'].includes(result.error.code)) return { status: 'rejected', message: result.error.message };
        throw new Error(result.error.message);
      }
      const receipt = commandResponseSchema.parse({ matchId: id, commandId, ...result.data });
      return receipt.status === 'accepted' ? { status: 'accepted', acceptedRevision: receipt.acceptedRevision }
        : { status: 'rejected', message: receipt.message };
    },
    async quoteProgram(input, signal) {
      const request = programQuoteRequestSchema.parse(input);
      signal.throwIfAborted(); const result = await window.neuroscape.quoteProgram(id, request); signal.throwIfAborted();
      if (!result.ok) throw new Error(result.error.message);
      const quote = programQuoteSchema.parse(result.data);
      if (JSON.stringify(quote.request) !== JSON.stringify(request)) throw new Error('Unexpected program quote.');
      return quote;
    },
    async quoteActivation(input, signal) {
      const request = activationQuoteRequestSchema.parse(input);
      signal.throwIfAborted(); const result = await window.neuroscape.quoteActivation(id, request); signal.throwIfAborted();
      if (!result.ok) throw new Error(result.error.message);
      const quote = activationQuoteSchema.parse(result.data);
      if (JSON.stringify(quote.request) !== JSON.stringify(request)) throw new Error('Unexpected activation quote.');
      return quote;
    },
  };
}

import type { AIProposalListItem, AIProposalSummary } from "./ai-proposal";

interface AIProposalEventEnvelope<TType extends string, TData> {
  type: TType;
  contractVersion: number;
  eventId: string;
  projectSequence: string;
  occurredAt: string;
  data: TData;
}

export type AIProposalRealtimeEvent =
  | AIProposalEventEnvelope<
      "ai_proposal.created" | "ai_proposal.updated",
      {
        proposal: Partial<AIProposalListItem> &
          Pick<AIProposalListItem, "id" | "version">;
      }
    >
  | AIProposalEventEnvelope<"ai_proposal.summary", AIProposalSummary>;

export function isAIProposalRealtimeEvent(
  value: unknown,
): value is AIProposalRealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.type === "string" &&
    [
      "ai_proposal.created",
      "ai_proposal.updated",
      "ai_proposal.summary",
    ].includes(event.type) &&
    typeof event.contractVersion === "number" &&
    typeof event.eventId === "string" &&
    typeof event.projectSequence === "string" &&
    typeof event.data === "object" &&
    event.data !== null
  );
}

import type {
  AIProposalDetailResponseDto,
  AIProposalListItemResponseDto,
  AIProposalSummaryResponseDto,
} from "@/shared/api/generated/models";

export type AIProposalWorkflowStatus =
  "OPEN" | "ACCEPTED" | "REJECTED" | "RESOLVED" | "EXPIRED" | "CANCELLED";
export type AIProposalDecisionMode = "ACKNOWLEDGE" | "APPROVE_REJECT";
export type AIProposalPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type AIProposalKind =
  "ADMIN_ATTENTION" | "INSIGHT" | "ACTION_RECOMMENDATION";
export type AIProposalSourceType = "TEXT_CHAT" | "VOICE" | "BACKGROUND_AI";
export type AIProposalPreset = "OPEN" | "UNREAD" | "COMPLETED";
export type AIProposalSort = "ATTENTION_FIRST" | "NEWEST" | "OLDEST";

export interface AIProposalEndUser {
  id: string;
  externalId: string;
  displayName?: string;
}

export interface AIProposalListItem {
  id: string;
  version: number;
  projectSequence: string;
  kind: AIProposalKind;
  workflowStatus: AIProposalWorkflowStatus;
  decisionMode: AIProposalDecisionMode;
  priority: AIProposalPriority;
  title: string;
  summary: string;
  sourceType: AIProposalSourceType;
  isRead: boolean;
  endUser?: AIProposalEndUser;
  conversationId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIProposalDetail extends AIProposalListItem {
  content: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  sourceInvocationId?: string;
  decidedByAdminId?: string;
  readAt?: string;
  decidedAt?: string;
  resolvedAt?: string;
  decisionReason?: string;
}

export interface AIProposalSummary {
  openCount: number;
  unreadCount: number;
  highPriorityUnreadCount: number;
  lastSequence: string;
  calculatedAt: string;
}

export interface AIProposalFilters {
  preset: AIProposalPreset;
  sort: AIProposalSort;
  kind?: AIProposalKind;
  priority?: AIProposalPriority;
  endUserId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export const defaultAIProposalFilters = (): AIProposalFilters => ({
  preset: "OPEN",
  sort: "ATTENTION_FIRST",
});

export function mapAIProposalSummary(
  value: AIProposalSummaryResponseDto,
): AIProposalSummary {
  return { ...value };
}

export function mapAIProposalListItem(
  value: AIProposalListItemResponseDto,
): AIProposalListItem {
  return {
    id: value.id,
    version: value.version,
    projectSequence: value.projectSequence,
    kind: value.kind,
    workflowStatus: value.workflowStatus,
    decisionMode: value.decisionMode,
    priority: value.priority,
    title: value.title,
    summary: value.summary,
    sourceType: value.sourceType,
    isRead: value.isRead,
    ...(value.endUser ? { endUser: value.endUser } : {}),
    ...(value.conversationId ? { conversationId: value.conversationId } : {}),
    ...(value.sourceMessageId
      ? { sourceMessageId: value.sourceMessageId }
      : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function mapAIProposalDetail(
  value: AIProposalDetailResponseDto,
): AIProposalDetail {
  return {
    ...mapAIProposalListItem(value),
    content: value.content,
    evidence: value.evidence,
    ...(value.sourceInvocationId
      ? { sourceInvocationId: value.sourceInvocationId }
      : {}),
    ...(value.decidedByAdminId
      ? { decidedByAdminId: value.decidedByAdminId }
      : {}),
    ...(value.readAt ? { readAt: value.readAt } : {}),
    ...(value.decidedAt ? { decidedAt: value.decidedAt } : {}),
    ...(value.resolvedAt ? { resolvedAt: value.resolvedAt } : {}),
    ...(value.decisionReason ? { decisionReason: value.decisionReason } : {}),
  };
}

export function proposalStatuses(
  preset: AIProposalPreset,
): AIProposalWorkflowStatus[] {
  if (preset === "COMPLETED")
    return ["REJECTED", "RESOLVED", "EXPIRED", "CANCELLED"];
  return ["OPEN", "ACCEPTED"];
}

export function isTerminalProposal(status: AIProposalWorkflowStatus): boolean {
  return ["REJECTED", "RESOLVED", "EXPIRED", "CANCELLED"].includes(status);
}

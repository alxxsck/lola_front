import type {
  AudienceIssueResponseDto,
  AudienceRuleDto,
  ConditionCatalogResponseDtoAudience,
  SegmentSummaryResponseDto,
} from "@/shared/api/repository/scenario-authoring";

export type AudienceNodeId = string;
export type AudienceLiteral =
  string | number | boolean | Array<string | number | boolean>;
export type AudienceLeafKind =
  "locale" | "language" | "country" | "userAttribute" | "segmentMembership";
export type AudienceComparisonOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists"
  | "is_missing"
  | "is_stale";
export type AudienceFreshness =
  { mode: "USE_LAST_KNOWN" } | { mode: "REQUIRE_FRESH"; maxAgeSeconds: number };

export interface AudienceDomainContext {
  catalog: ConditionCatalogResponseDtoAudience;
  segments: SegmentSummaryResponseDto[];
  allowSegments?: boolean;
}

interface AudienceDraftNodeBase {
  nodeId: AudienceNodeId;
}

export type AudienceLeafDraftNode = AudienceDraftNodeBase &
  (
    | {
        kind: "locale";
        operator: AudienceComparisonOperator;
        value?: string | string[];
      }
    | {
        kind: "language";
        operator: AudienceComparisonOperator;
        value?: string | string[];
      }
    | {
        kind: "country";
        operator: AudienceComparisonOperator;
        value?: string | string[];
      }
    | {
        kind: "userAttribute";
        definitionId: string;
        operator: AudienceComparisonOperator;
        value?: AudienceLiteral;
      }
    | {
        kind: "segmentMembership";
        segmentId: string;
        segmentRevisionId: string;
        operator: "is_member" | "is_not_member";
      }
  );

export type AudienceLeafInput = AudienceLeafDraftNode extends infer Leaf
  ? Leaf extends AudienceDraftNodeBase
    ? Omit<Leaf, "nodeId">
    : never
  : never;

export type AudienceDraftNode =
  | AudienceLeafDraftNode
  | (AudienceDraftNodeBase & { kind: "all"; children: AudienceDraftNode[] })
  | (AudienceDraftNodeBase & { kind: "any"; children: AudienceDraftNode[] })
  | (AudienceDraftNodeBase & { kind: "not"; child: AudienceDraftNode })
  | (AudienceDraftNodeBase & {
      kind: "opaque";
      source: unknown;
      reportedKind?: string;
    });

export interface AudienceDraft {
  version: 1 | 2;
  freshness?: AudienceFreshness;
  root: AudienceDraftNode;
}

export type AudienceCommand =
  | { type: "add"; parentNodeId: AudienceNodeId; leaf: AudienceLeafInput }
  | { type: "addGroup"; parentNodeId: AudienceNodeId; kind?: "all" | "any" }
  | { type: "replaceLeaf"; nodeId: AudienceNodeId; leaf: AudienceLeafInput }
  | { type: "remove"; nodeId: AudienceNodeId }
  | { type: "wrapNot"; nodeId: AudienceNodeId }
  | { type: "unwrapNot"; nodeId: AudienceNodeId }
  | { type: "changeGroup"; nodeId: AudienceNodeId; kind: "all" | "any" }
  | { type: "move"; nodeId: AudienceNodeId; direction: "up" | "down" };

export interface AudienceDraftIssue {
  code: string;
  message: string;
  nodeId?: AudienceNodeId;
  fieldPath?: string;
}

export type AudienceCommandResult =
  | { ok: true; draft: AudienceDraft; focusNodeId: AudienceNodeId }
  | { ok: false; draft: AudienceDraft; error: AudienceDraftIssue };

export interface AudiencePathEntry {
  nodeId: AudienceNodeId;
  nodePath: string;
}

export type AudiencePathIndex = Readonly<Record<string, AudiencePathEntry>>;
export type AudienceSerializationResult =
  | { ok: true; value: AudienceRuleDto; pathIndex: AudiencePathIndex }
  | { ok: false; issues: AudienceDraftIssue[] };

export interface AudienceDeserializeResult {
  draft: AudienceDraft;
  issues: AudienceDraftIssue[];
}

export interface MappedAudienceIssue extends AudienceIssueResponseDto {
  nodeId?: AudienceNodeId;
  fieldPath?: string;
}

export interface AudienceSummary {
  text: string;
  byNodeId: Readonly<Record<AudienceNodeId, string>>;
  status: "empty" | "ready" | "invalid" | "unsupported";
  nodes: number;
  leaves: number;
  segmentLeaves: number;
  sensitiveLeaves: number;
}

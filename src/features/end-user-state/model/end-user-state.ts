export interface EndUserAttributeDefinition {
  key: string;
  version: number;
  owner: "CMS_MANAGED" | "MODULE_PROJECTED";
  classification: "INTERNAL" | "SENSITIVE" | "RESTRICTED";
  schema: unknown;
  label: Record<string, string>;
  description: Record<string, string>;
  writable: boolean;
}
export interface EndUserAttributeCurrent {
  version: number;
  definitionVersion: number;
  state: "UNSET" | "SCHEDULED" | "EXPIRED" | "ACTIVE";
  value: unknown;
  effectiveAt: string;
  expiresAt: string | null;
  actor: { type: string; id: string };
  reason: string;
  updatedAt: string;
}
export interface EndUserOperationalState {
  projectId: string;
  endUserId: string;
  items: Array<{
    definition: EndUserAttributeDefinition;
    current: EndUserAttributeCurrent | null;
  }>;
}
export interface PutEndUserAttributeInput {
  operation: "SET" | "UNSET";
  value?: unknown;
  expectedVersion: number;
  reason: string;
  effectiveAt?: string;
  expiresAt?: string;
}
export interface EndUserAttributeHistory {
  projectId: string;
  endUserId: string;
  attributeKey: string;
  definition: EndUserAttributeDefinition;
  items: Array<{
    id: string;
    version: number;
    definitionVersion: number;
    operation: "SET" | "UNSET";
    value: unknown;
    effectiveAt: string;
    expiresAt: string | null;
    actor: { type: string; id: string };
    reason: string;
    createdAt: string;
  }>;
  page: { limit: number; offset: number; total: number; hasMore: boolean };
}

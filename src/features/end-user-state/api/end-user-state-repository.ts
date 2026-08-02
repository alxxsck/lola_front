import { axiosInstance } from "@/shared/api/http/axios-instance";
import type {
  EndUserAttributeHistory,
  EndUserOperationalState,
  PutEndUserAttributeInput,
} from "../model/end-user-state";
const root = (projectId: string, endUserId: string) =>
  `/api/v1/admin/projects/${encodeURIComponent(projectId)}/end-users/${encodeURIComponent(endUserId)}/operational-state`;
export const endUserStateRepository = {
  async get(
    projectId: string,
    endUserId: string,
  ): Promise<EndUserOperationalState> {
    return validateState(
      (await axiosInstance.get(root(projectId, endUserId))).data,
    );
  },
  async history(
    projectId: string,
    endUserId: string,
    key: string,
    query: { limit: number; offset: number } = { limit: 50, offset: 0 },
  ): Promise<EndUserAttributeHistory> {
    return validateHistory(
      (
        await axiosInstance.get(
          `${root(projectId, endUserId)}/${encodeURIComponent(key)}/history`,
          { params: query },
        )
      ).data,
    );
  },
  async put(
    projectId: string,
    endUserId: string,
    key: string,
    input: PutEndUserAttributeInput,
    idem: string,
  ): Promise<unknown> {
    return (
      await axiosInstance.put(
        `${root(projectId, endUserId)}/${encodeURIComponent(key)}`,
        input,
        { headers: { "Idempotency-Key": idem } },
      )
    ).data;
  },
};
function validateState(value: unknown): EndUserOperationalState {
  const s = object(value);
  if (!s || !text(s.projectId) || !text(s.endUserId) || !Array.isArray(s.items))
    invalid();
  const items = s.items.map((item) => {
    const x = object(item);
    const definition = parseDefinition(x?.definition);
    const current = x?.current === null ? null : parseCurrent(x?.current);
    return definition && (current || x?.current === null)
      ? { definition, current }
      : null;
  });
  if (items.some((item) => !item)) invalid();
  return {
    projectId: s.projectId,
    endUserId: s.endUserId,
    items: items as EndUserOperationalState["items"],
  };
}
function validateHistory(value: unknown): EndUserAttributeHistory {
  const s = object(value);
  const definition = parseDefinition(s?.definition);
  const page = object(s?.page);
  if (
    !s ||
    !definition ||
    !text(s.projectId) ||
    !text(s.endUserId) ||
    !text(s.attributeKey) ||
    !Array.isArray(s.items) ||
    !page ||
    !integer(page.limit) ||
    !integer(page.offset) ||
    !integer(page.total) ||
    typeof page.hasMore !== "boolean"
  )
    invalid();
  const items = s.items.map((item) => {
    const x = object(item);
    const actor = object(x?.actor);
    return x &&
      text(x.id) &&
      integer(x.version) &&
      integer(x.definitionVersion) &&
      (x.operation === "SET" || x.operation === "UNSET") &&
      iso(x.effectiveAt) &&
      (x.expiresAt === null || iso(x.expiresAt)) &&
      actor &&
      text(actor.type) &&
      text(actor.id) &&
      text(x.reason) &&
      iso(x.createdAt)
      ? {
          id: x.id,
          version: x.version,
          definitionVersion: x.definitionVersion,
          operation: x.operation,
          value: x.value,
          effectiveAt: x.effectiveAt,
          expiresAt: x.expiresAt as string | null,
          actor: { type: actor.type, id: actor.id },
          reason: x.reason,
          createdAt: x.createdAt,
        }
      : null;
  });
  if (items.some((item) => !item)) invalid();
  return {
    projectId: s.projectId,
    endUserId: s.endUserId,
    attributeKey: s.attributeKey,
    definition,
    items: items as EndUserAttributeHistory["items"],
    page: {
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      hasMore: page.hasMore,
    },
  };
}
function parseDefinition(
  value: unknown,
): EndUserOperationalState["items"][number]["definition"] | undefined {
  const s = object(value);
  return s &&
    text(s.key) &&
    integer(s.version) &&
    (s.owner === "CMS_MANAGED" || s.owner === "MODULE_PROJECTED") &&
    (s.classification === "INTERNAL" ||
      s.classification === "SENSITIVE" ||
      s.classification === "RESTRICTED") &&
    localizedText(s.label) &&
    localizedText(s.description) &&
    typeof s.writable === "boolean"
    ? {
        key: s.key,
        version: s.version,
        owner: s.owner,
        classification: s.classification,
        schema: s.schema,
        label: s.label as Record<string, string>,
        description: s.description as Record<string, string>,
        writable: s.writable,
      }
    : undefined;
}
function parseCurrent(
  value: unknown,
): EndUserOperationalState["items"][number]["current"] | undefined {
  const s = object(value);
  const actor = object(s?.actor);
  return s &&
    integer(s.version) &&
    integer(s.definitionVersion) &&
    (s.state === "UNSET" || s.state === "EXPIRED" || s.state === "ACTIVE") &&
    iso(s.effectiveAt) &&
    (s.expiresAt === null || iso(s.expiresAt)) &&
    actor &&
    text(actor.type) &&
    text(actor.id) &&
    text(s.reason) &&
    iso(s.updatedAt)
    ? {
        version: s.version,
        definitionVersion: s.definitionVersion,
        state: s.state,
        value: s.value,
        effectiveAt: s.effectiveAt,
        expiresAt: s.expiresAt as string | null,
        actor: { type: actor.type, id: actor.id },
        reason: s.reason,
        updatedAt: s.updatedAt,
      }
    : undefined;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2000;
}
function localizedText(value: unknown): value is Record<string, string> {
  const source = object(value);
  return Boolean(
    source &&
    Object.keys(source).length <= 20 &&
    Object.values(source).every(
      (item) => typeof item === "string" && item.length <= 2000,
    ),
  );
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function iso(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value));
}
function invalid(): never {
  throw new Error(
    "Сервер вернул некорректное внутреннее состояние пользователя",
  );
}

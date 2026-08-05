import {
  aiPricingRevisionGet,
  aiPricingRevisionPublish,
} from "@/shared/api/generated/retenive-backend";
import type { PublishAiPricingRevisionDto } from "@/shared/api/generated/models";

const REVISION_LIMIT = 100;
const RATE_PATTERN = /^\d+(?:\.\d{1,12})?$/u;
const ACTOR_TYPES = new Set(["CMS_USER", "BREAK_GLASS", "SYSTEM"]);

export interface TextToSpeechPricingRevision {
  id: string;
  provider: "xai";
  operation: "speech";
  currency: "usd";
  unit: "per_million_input_characters";
  rate: string;
  effectiveFrom: string;
  sourceUrl: string;
  changeReason: string;
  createdBy: { type: "CMS_USER" | "BREAK_GLASS" | "SYSTEM"; id: string };
  createdAt: string;
}

export interface TextToSpeechPricingState {
  current: TextToSpeechPricingRevision | null;
  history: TextToSpeechPricingRevision[];
  hasMore: boolean;
  nextCursor: string | null;
  sourceUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function safeHttpsUrl(value: unknown): value is string {
  if (!boundedText(value, 2_048)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isoDate(value: unknown): value is string {
  return (
    boundedText(value, 64) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function parseRevision(
  value: unknown,
): TextToSpeechPricingRevision | undefined {
  if (
    !isRecord(value) ||
    !boundedText(value.id, 64) ||
    value.provider !== "xai" ||
    value.operation !== "speech" ||
    value.currency !== "usd" ||
    value.unit !== "per_million_input_characters" ||
    !boundedText(value.rate, 64) ||
    !RATE_PATTERN.test(value.rate) ||
    Number(value.rate) <= 0 ||
    !isoDate(value.effectiveFrom) ||
    !safeHttpsUrl(value.sourceUrl) ||
    !boundedText(value.changeReason, 500) ||
    !isRecord(value.createdBy) ||
    typeof value.createdBy.type !== "string" ||
    !ACTOR_TYPES.has(value.createdBy.type) ||
    !boundedText(value.createdBy.id, 200) ||
    !isoDate(value.createdAt)
  ) {
    return undefined;
  }
  return value as unknown as TextToSpeechPricingRevision;
}

export function parseTextToSpeechPricing(
  value: unknown,
): TextToSpeechPricingState | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.history) ||
    value.history.length > REVISION_LIMIT ||
    typeof value.hasMore !== "boolean" ||
    (value.nextCursor !== null && !boundedText(value.nextCursor, 64)) ||
    !safeHttpsUrl(value.sourceUrl)
  ) {
    return undefined;
  }
  const current = value.current === null ? null : parseRevision(value.current);
  if (current === undefined) return undefined;
  const history = value.history.map(parseRevision);
  if (history.some((revision) => !revision)) return undefined;
  if (
    history.some((revision) => revision?.sourceUrl !== value.sourceUrl) ||
    (current && current.sourceUrl !== value.sourceUrl)
  ) {
    return undefined;
  }
  return {
    current,
    history: history as TextToSpeechPricingRevision[],
    hasMore: value.hasMore,
    nextCursor: value.nextCursor as string | null,
    sourceUrl: value.sourceUrl,
  };
}

function requirePricingState(value: unknown): TextToSpeechPricingState {
  const state = parseTextToSpeechPricing(value);
  if (!state) {
    throw new Error("Сервер вернул некорректные данные тарифа xAI");
  }
  return state;
}

export async function fetchTextToSpeechPricing(
  request: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<TextToSpeechPricingState> {
  const response: unknown = await aiPricingRevisionGet(request, { signal });
  return requirePricingState(response);
}

export async function publishTextToSpeechPricing(
  input: PublishAiPricingRevisionDto,
): Promise<TextToSpeechPricingState> {
  const response: unknown = await aiPricingRevisionPublish(input);
  return requirePricingState(response);
}

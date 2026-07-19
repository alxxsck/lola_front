import type {
  AudienceIssueResponseDto,
  AudienceRuleDtoRoot,
} from "@/shared/api/repository/scenario-authoring";
import { uid } from "@/shared/lib/format";

import type {
  AudienceCommand,
  AudienceCommandResult,
  AudienceComparisonOperator,
  AudienceDeserializeResult,
  AudienceDomainContext,
  AudienceDraft,
  AudienceDraftIssue,
  AudienceDraftNode,
  AudienceLeafDraftNode,
  AudienceLeafInput,
  AudienceLiteral,
  AudiencePathEntry,
  AudiencePathIndex,
  AudienceSerializationResult,
  AudienceSummary,
  MappedAudienceIssue,
} from "./audience-types";

export const AUDIENCE_LIMITS = {
  maxDepth: 4,
  maxNodes: 100,
  maxLeaves: 50,
  maxGroupChildren: 20,
  maxLiteralArrayItems: 100,
  maxLiteralStringLength: 256,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function cloneNode(node: AudienceDraftNode): AudienceDraftNode {
  if (node.kind === "all" || node.kind === "any")
    return { ...node, children: node.children.map(cloneNode) };
  if (node.kind === "not") return { ...node, child: cloneNode(node.child) };
  if (node.kind === "opaque") return { ...node, source: clone(node.source) };
  return clone(node);
}

function cloneDraft(draft: AudienceDraft): AudienceDraft {
  return {
    version: draft.version,
    ...(draft.freshness ? { freshness: clone(draft.freshness) } : {}),
    root: cloneNode(draft.root),
  };
}

export function createAudienceDraft(): AudienceDraft {
  return {
    version: 1,
    root: { nodeId: uid("audience_node"), kind: "all", children: [] },
  };
}

function createLeaf(
  leaf: AudienceLeafInput,
  nodeId = uid("audience_node"),
): AudienceLeafDraftNode {
  return { ...clone(leaf), nodeId } as AudienceLeafDraftNode;
}

interface NodeLocation {
  node: AudienceDraftNode;
  parent?: Extract<AudienceDraftNode, { kind: "all" | "any" | "not" }>;
  index?: number;
}

function findNode(
  root: AudienceDraftNode,
  nodeId: string,
): NodeLocation | undefined {
  if (root.nodeId === nodeId) return { node: root };
  if (root.kind === "all" || root.kind === "any") {
    for (const [index, child] of root.children.entries()) {
      if (child.nodeId === nodeId) return { node: child, parent: root, index };
      const nested = findNode(child, nodeId);
      if (nested) return nested;
    }
  }
  if (root.kind === "not") {
    if (root.child.nodeId === nodeId) return { node: root.child, parent: root };
    return findNode(root.child, nodeId);
  }
  return undefined;
}

function replaceNode(
  draft: AudienceDraft,
  location: NodeLocation,
  replacement: AudienceDraftNode,
) {
  if (!location.parent) draft.root = replacement;
  else if (location.parent.kind === "not") location.parent.child = replacement;
  else if (location.index !== undefined)
    location.parent.children[location.index] = replacement;
}

function validateLimits(
  root: AudienceDraftNode,
): AudienceDraftIssue | undefined {
  let nodes = 0;
  let leaves = 0;
  let issue: AudienceDraftIssue | undefined;
  const visit = (node: AudienceDraftNode, depth: number) => {
    if (issue) return;
    nodes += 1;
    if (depth > AUDIENCE_LIMITS.maxDepth)
      issue = {
        code: "depth-limit",
        nodeId: node.nodeId,
        message: `Допустима вложенность не более ${AUDIENCE_LIMITS.maxDepth} уровней.`,
      };
    else if (node.kind === "all" || node.kind === "any") {
      if (node.children.length > AUDIENCE_LIMITS.maxGroupChildren)
        issue = {
          code: "group-limit",
          nodeId: node.nodeId,
          message: `В группе допустимо не более ${AUDIENCE_LIMITS.maxGroupChildren} условий.`,
        };
      else node.children.forEach((child) => visit(child, depth + 1));
    } else if (node.kind === "not") visit(node.child, depth + 1);
    else leaves += 1;
  };
  visit(root, 0);
  if (issue) return issue;
  if (nodes > AUDIENCE_LIMITS.maxNodes)
    return {
      code: "node-limit",
      message: `В аудитории допустимо не более ${AUDIENCE_LIMITS.maxNodes} узлов.`,
    };
  if (leaves > AUDIENCE_LIMITS.maxLeaves)
    return {
      code: "leaf-limit",
      message: `В аудитории допустимо не более ${AUDIENCE_LIMITS.maxLeaves} условий.`,
    };
  return undefined;
}

export function applyAudienceCommand(
  draft: AudienceDraft,
  command: AudienceCommand,
  context: AudienceDomainContext,
): AudienceCommandResult {
  const next = cloneDraft(draft);
  const location = findNode(
    next.root,
    "parentNodeId" in command ? command.parentNodeId : command.nodeId,
  );
  if (!location)
    return {
      ok: false,
      draft,
      error: {
        code: "node-not-found",
        message: "Условие больше не найдено. Обновите редактор.",
        nodeId: "nodeId" in command ? command.nodeId : command.parentNodeId,
      },
    };

  let focusNodeId = location.node.nodeId;
  if (command.type === "add" || command.type === "addGroup") {
    if (location.node.kind !== "all" && location.node.kind !== "any")
      return {
        ok: false,
        draft,
        error: {
          code: "parent-not-group",
          nodeId: location.node.nodeId,
          message: "Добавить условие можно только в группу.",
        },
      };
    const node: AudienceDraftNode =
      command.type === "add"
        ? createLeaf(command.leaf)
        : {
            nodeId: uid("audience_node"),
            kind: command.kind ?? "all",
            children: [],
          };
    location.node.children.push(node);
    focusNodeId = node.nodeId;
  } else if (command.type === "replaceLeaf") {
    if (
      location.node.kind === "all" ||
      location.node.kind === "any" ||
      location.node.kind === "not"
    )
      return {
        ok: false,
        draft,
        error: {
          code: "not-leaf",
          nodeId: location.node.nodeId,
          message: "Группу нельзя заменить отдельным условием.",
        },
      };
    const node = createLeaf(command.leaf, location.node.nodeId);
    replaceNode(next, location, node);
  } else if (command.type === "remove") {
    if (!location.parent)
      return {
        ok: false,
        draft,
        error: {
          code: "root-required",
          nodeId: command.nodeId,
          message: "Корневую группу нельзя удалить.",
        },
      };
    if (location.parent.kind === "not")
      return {
        ok: false,
        draft,
        error: {
          code: "remove-not-child",
          nodeId: command.nodeId,
          message: "Сначала уберите отрицание.",
        },
      };
    location.parent.children.splice(location.index ?? -1, 1);
    focusNodeId = location.parent.nodeId;
  } else if (command.type === "wrapNot") {
    const wrapper: AudienceDraftNode = {
      nodeId: uid("audience_node"),
      kind: "not",
      child: location.node,
    };
    replaceNode(next, location, wrapper);
    focusNodeId = wrapper.nodeId;
  } else if (command.type === "unwrapNot") {
    if (location.node.kind !== "not")
      return {
        ok: false,
        draft,
        error: {
          code: "not-wrapper",
          nodeId: command.nodeId,
          message: "У выбранного условия нет отрицания.",
        },
      };
    replaceNode(next, location, location.node.child);
    focusNodeId = location.node.child.nodeId;
  } else if (command.type === "changeGroup") {
    if (location.node.kind !== "all" && location.node.kind !== "any")
      return {
        ok: false,
        draft,
        error: {
          code: "not-group",
          nodeId: command.nodeId,
          message: "Режим доступен только для группы.",
        },
      };
    location.node.kind = command.kind;
  } else if (command.type === "move") {
    if (
      !location.parent ||
      location.parent.kind === "not" ||
      location.index === undefined
    )
      return {
        ok: false,
        draft,
        error: {
          code: "move-root",
          nodeId: command.nodeId,
          message: "Это условие нельзя переместить.",
        },
      };
    const nextIndex =
      command.direction === "up" ? location.index - 1 : location.index + 1;
    if (nextIndex < 0 || nextIndex >= location.parent.children.length)
      return {
        ok: false,
        draft,
        error: {
          code: "move-boundary",
          nodeId: command.nodeId,
          message: "Условие уже находится у края группы.",
        },
      };
    const [node] = location.parent.children.splice(location.index, 1);
    if (node) location.parent.children.splice(nextIndex, 0, node);
  }

  const limitIssue = validateLimits(next.root);
  if (limitIssue) return { ok: false, draft, error: limitIssue };
  const semanticIssue =
    command.type === "add" || command.type === "replaceLeaf"
      ? validateLeaf(findNode(next.root, focusNodeId)?.node, context)
      : undefined;
  if (semanticIssue) return { ok: false, draft, error: semanticIssue };
  return { ok: true, draft: next, focusNodeId };
}

function opaqueNode(source: unknown): AudienceDraftNode {
  return {
    nodeId: uid("audience_node"),
    kind: "opaque",
    source: clone(source),
    ...(isRecord(source) && typeof source.kind === "string"
      ? { reportedKind: source.kind }
      : {}),
  };
}

function parseNode(
  source: unknown,
  issues: AudienceDraftIssue[],
): AudienceDraftNode {
  if (!isRecord(source) || typeof source.kind !== "string") {
    const node = opaqueNode(source);
    issues.push({
      code: "unsupported-node",
      nodeId: node.nodeId,
      message: "Формат условия аудитории пока не поддерживается.",
    });
    return node;
  }
  if (
    (source.kind === "all" || source.kind === "any") &&
    Array.isArray(source.children)
  )
    return {
      nodeId: uid("audience_node"),
      kind: source.kind,
      children: source.children.map((child) => parseNode(child, issues)),
    };
  if (source.kind === "not" && Object.hasOwn(source, "child"))
    return {
      nodeId: uid("audience_node"),
      kind: "not",
      child: parseNode(source.child, issues),
    };
  if (
    (source.kind === "locale" ||
      source.kind === "language" ||
      source.kind === "country") &&
    typeof source.operator === "string"
  ) {
    const common = {
      nodeId: uid("audience_node"),
      operator: source.operator as AudienceComparisonOperator,
      ...(Object.hasOwn(source, "value")
        ? { value: clone(source.value) as string | string[] }
        : {}),
    };
    if (source.kind === "locale") return { ...common, kind: "locale" };
    if (source.kind === "language") return { ...common, kind: "language" };
    return { ...common, kind: "country" };
  }
  if (
    (source.kind === "userAttribute" || source.kind === "profileAttribute") &&
    typeof source.definitionId === "string" &&
    typeof source.operator === "string"
  )
    return {
      nodeId: uid("audience_node"),
      kind: "userAttribute",
      definitionId: source.definitionId,
      operator: source.operator as AudienceComparisonOperator,
      ...(Object.hasOwn(source, "value")
        ? { value: clone(source.value) as AudienceLiteral }
        : {}),
    };
  if (
    source.kind === "segmentMembership" &&
    typeof source.segmentId === "string" &&
    typeof source.segmentRevisionId === "string" &&
    (source.operator === "is_member" || source.operator === "is_not_member")
  )
    return {
      nodeId: uid("audience_node"),
      kind: "segmentMembership",
      segmentId: source.segmentId,
      segmentRevisionId: source.segmentRevisionId,
      operator: source.operator,
    };
  const node = opaqueNode(source);
  issues.push({
    code: "unsupported-node",
    nodeId: node.nodeId,
    message: `Условие «${node.kind === "opaque" ? (node.reportedKind ?? "неизвестное") : "неизвестное"}» пока нельзя изменить в интерфейсе.`,
  });
  return node;
}

export function deserializeAudience(
  input: unknown,
  context: AudienceDomainContext,
): AudienceDeserializeResult {
  const issues: AudienceDraftIssue[] = [];
  if (
    !isRecord(input) ||
    (input.version !== 1 && input.version !== 2) ||
    !Object.hasOwn(input, "root")
  ) {
    const root = opaqueNode(input);
    return {
      draft: { version: 1, root },
      issues: [
        {
          code: "unsupported-rule",
          nodeId: root.nodeId,
          message: "Эта версия условий больше не поддерживается.",
        },
      ],
    };
  }
  const freshness =
    input.version === 2 &&
    isRecord(input.freshness) &&
    (input.freshness.mode === "USE_LAST_KNOWN" ||
      (input.freshness.mode === "REQUIRE_FRESH" &&
        typeof input.freshness.maxAgeSeconds === "number"))
      ? (clone(input.freshness) as AudienceDraft["freshness"])
      : undefined;
  const draft: AudienceDraft = {
    version: input.version,
    ...(freshness ? { freshness } : {}),
    root: parseNode(input.root, issues),
  };
  return {
    draft,
    issues: [
      ...issues,
      ...collectAudienceIssues(draft, context).filter(
        (issue) =>
          !issues.some(
            (known) =>
              known.nodeId === issue.nodeId && known.code === issue.code,
          ),
      ),
    ],
  };
}

function isPresenceOperator(operator: string): boolean {
  return (
    operator === "exists" ||
    operator === "not_exists" ||
    operator === "is_missing" ||
    operator === "is_stale"
  );
}

function isV2(context: AudienceDomainContext): boolean {
  return context.catalog.version === 2;
}

function catalogAttribute(
  context: AudienceDomainContext,
  definitionId: string,
) {
  return context.catalog.attributes.find(
    (attribute) => attribute.definitionId === definitionId,
  );
}

function v1Source(
  context: AudienceDomainContext,
  kind: "locale" | "language" | "country",
) {
  if (context.catalog.version !== 1) return undefined;
  return kind === "locale"
    ? context.catalog.localeSource
    : kind === "language"
      ? context.catalog.languageSource
      : context.catalog.country;
}

function validLiteral(value: unknown): boolean {
  if (typeof value === "string")
    return value.length <= AUDIENCE_LIMITS.maxLiteralStringLength;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= AUDIENCE_LIMITS.maxLiteralArrayItems &&
    value.every((item) => !Array.isArray(item) && validLiteral(item))
  );
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function decimalShape(value: string) {
  const match = /^(-)?(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const integer = match[2]!;
  const fraction = match[3] ?? "";
  return {
    negative: Boolean(match[1]),
    integer,
    fraction,
    precision: `${integer.replace(/^0+(?=\d)/, "")}${fraction}`.length,
    scale: fraction.length,
  };
}

function compareDecimal(left: string, right: string): number | null {
  const a = decimalShape(left);
  const b = decimalShape(right);
  if (!a || !b) return null;
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const aDigits = `${a.integer}${a.fraction.padEnd(width, "0")}`.replace(
    /^0+(?=\d)/,
    "",
  );
  const bDigits = `${b.integer}${b.fraction.padEnd(width, "0")}`.replace(
    /^0+(?=\d)/,
    "",
  );
  const absolute =
    aDigits.length === bDigits.length
      ? aDigits.localeCompare(bDigits)
      : aDigits.length < bDigits.length
        ? -1
        : 1;
  return a.negative ? -absolute : absolute;
}

function typedAttributeLiteralIssue(
  attribute: NonNullable<ReturnType<typeof catalogAttribute>>,
  value: unknown,
): string | undefined {
  const constraints =
    "constraints" in attribute ? attribute.constraints : undefined;
  const valueType = attribute.valueType;
  if (valueType === "INTEGER") {
    if (typeof value !== "number" || !Number.isSafeInteger(value))
      return "Введите целое число в безопасном диапазоне.";
    if (typeof constraints?.minimum === "number" && value < constraints.minimum)
      return `Значение должно быть не меньше ${constraints.minimum}.`;
    if (typeof constraints?.maximum === "number" && value > constraints.maximum)
      return `Значение должно быть не больше ${constraints.maximum}.`;
  } else if (valueType === "DECIMAL") {
    if (typeof value !== "string") return "DECIMAL передаётся точной строкой.";
    const shape = decimalShape(value);
    if (!shape) return "Введите DECIMAL без экспоненты, например 12.50.";
    if (constraints?.precision && shape.precision > constraints.precision)
      return `DECIMAL допускает не более ${constraints.precision} цифр.`;
    if (constraints?.scale !== undefined && shape.scale > constraints.scale)
      return `DECIMAL допускает не более ${constraints.scale} знаков после точки.`;
    if (
      constraints?.minimum !== undefined &&
      compareDecimal(value, String(constraints.minimum)) === -1
    )
      return `Значение должно быть не меньше ${constraints.minimum}.`;
    if (
      constraints?.maximum !== undefined &&
      compareDecimal(value, String(constraints.maximum)) === 1
    )
      return `Значение должно быть не больше ${constraints.maximum}.`;
  } else if (valueType === "DATE") {
    if (typeof value !== "string" || !validCalendarDate(value))
      return "Введите существующую календарную дату YYYY-MM-DD.";
  } else if (valueType === "DATETIME") {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) ||
      !Number.isFinite(Date.parse(value))
    )
      return "Укажите дату, время и часовой пояс, например 2026-07-19T10:00:00Z.";
  } else if (valueType === "COUNTRY_CODE") {
    if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value))
      return "Введите двухбуквенный код страны, например ES.";
  } else if (valueType === "CURRENCY_CODE") {
    if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
      return "Введите трёхбуквенный код валюты, например EUR.";
  } else if (valueType === "BOOLEAN" || valueType === "boolean") {
    if (typeof value !== "boolean") return "Выберите Да или Нет.";
  } else if (valueType === "number" || valueType === "LEGACY_NUMBER") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return "Введите конечное число.";
    if (typeof constraints?.minimum === "number" && value < constraints.minimum)
      return `Значение должно быть не меньше ${constraints.minimum}.`;
    if (typeof constraints?.maximum === "number" && value > constraints.maximum)
      return `Значение должно быть не больше ${constraints.maximum}.`;
  } else if (typeof value !== "string") {
    return "Введите строковое значение.";
  }
  if (typeof value === "string") {
    if (
      constraints?.minLength !== undefined &&
      value.length < constraints.minLength
    )
      return `Минимальная длина — ${constraints.minLength}.`;
    if (
      constraints?.maxLength !== undefined &&
      value.length > constraints.maxLength
    )
      return `Максимальная длина — ${constraints.maxLength}.`;
  }
  return undefined;
}

function validateLeaf(
  node: AudienceDraftNode | undefined,
  context: AudienceDomainContext,
): AudienceDraftIssue | undefined {
  if (
    !node ||
    node.kind === "all" ||
    node.kind === "any" ||
    node.kind === "not"
  )
    return undefined;
  if (node.kind === "opaque")
    return {
      code: "unsupported-node",
      nodeId: node.nodeId,
      message: "Неподдерживаемое условие нужно заменить или удалить.",
    };
  if (node.kind === "segmentMembership") {
    if (context.allowSegments === false)
      return {
        code: "segment-nesting-unsupported",
        nodeId: node.nodeId,
        message: "Сегмент нельзя включать в определение другого сегмента.",
      };
    // Existing drafts pin immutable revisions. A later head or archive must not
    // invalidate that exact identity; backend authoritatively resolves the pin.
    // New leaves can still only be created from a loaded ACTIVE current revision.
    if (!node.segmentId || !node.segmentRevisionId)
      return {
        code: "segment-unavailable",
        nodeId: node.nodeId,
        fieldPath: "segmentId",
        message: "У закреплённого сегмента отсутствует точная версия.",
      };
    return undefined;
  }
  const operatorSource =
    node.kind === "userAttribute"
      ? catalogAttribute(context, node.definitionId)
      : v1Source(context, node.kind);
  if (!operatorSource)
    return {
      code: "attribute-unavailable",
      nodeId: node.nodeId,
      fieldPath: "definitionId",
      message: "Атрибут больше не доступен в каталоге проекта.",
    };
  if (!(operatorSource.operators as readonly string[]).includes(node.operator))
    return {
      code: "operator-unavailable",
      nodeId: node.nodeId,
      fieldPath: "operator",
      message: "Оператор больше не поддерживается выбранным источником.",
    };
  if (isPresenceOperator(node.operator))
    return node.value === undefined
      ? undefined
      : {
          code: "presence-has-value",
          nodeId: node.nodeId,
          fieldPath: "value",
          message: "Для проверки наличия значение не задаётся.",
        };
  if (node.value === undefined || !validLiteral(node.value))
    return {
      code: "value-required",
      nodeId: node.nodeId,
      fieldPath: "value",
      message: "Укажите допустимое значение.",
    };
  const requiresArray = node.operator === "in" || node.operator === "not_in";
  if (requiresArray && !Array.isArray(node.value))
    return {
      code: "in-requires-array",
      nodeId: node.nodeId,
      fieldPath: "value",
      message: "Для проверки по списку выберите хотя бы одно значение.",
    };
  if (!requiresArray && Array.isArray(node.value))
    return {
      code: "scalar-required",
      nodeId: node.nodeId,
      fieldPath: "value",
      message: "Для выбранной проверки укажите одно значение.",
    };
  if (node.kind === "locale") {
    const values = Array.isArray(node.value) ? node.value : [node.value];
    if (context.catalog.version !== 1)
      return {
        code: "locale-unavailable",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: "Выберите доступное поле профиля пользователя.",
      };
    if (
      !values.every(
        (value) =>
          context.catalog.version === 1 &&
          context.catalog.locales.some((locale) => locale.code === value),
      )
    )
      return {
        code: "locale-unavailable",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: "Выберите регион и язык из списка проекта.",
      };
  }
  if (node.kind === "language") {
    const values = Array.isArray(node.value) ? node.value : [node.value];
    if (context.catalog.version !== 1)
      return {
        code: "language-unavailable",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: "Отдельный выбор языка здесь недоступен. Выберите поле профиля пользователя.",
      };
    if (
      !values.every(
        (value) =>
          context.catalog.version === 1 &&
          context.catalog.locales.some((locale) => locale.language === value),
      )
    )
      return {
        code: "language-unavailable",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: "Выберите язык из каталога проекта.",
      };
  }
  if (node.kind === "country") {
    const values = Array.isArray(node.value) ? node.value : [node.value];
    if (!values.every((value) => /^[A-Z]{2}$/.test(value)))
      return {
        code: "country-invalid",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: "Введите двухбуквенный код страны, например ES.",
      };
  }
  if (node.kind === "userAttribute") {
    const attribute = catalogAttribute(context, node.definitionId);
    if (!attribute)
      return {
        code: "attribute-unavailable",
        nodeId: node.nodeId,
        fieldPath: "definitionId",
        message: "Атрибут больше не доступен в каталоге проекта.",
      };
    const values = Array.isArray(node.value) ? node.value : [node.value];
    const typedIssue = values
      .map((value) => typedAttributeLiteralIssue(attribute, value))
      .find(Boolean);
    if (typedIssue)
      return {
        code: "attribute-value-type",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: typedIssue,
      };
    if (
      attribute.allowedValues?.length &&
      !values.every((value) => attribute.allowedValues?.includes(value))
    )
      return {
        code: "attribute-value-unavailable",
        nodeId: node.nodeId,
        fieldPath: "value",
        message: "Выберите значение из каталога атрибута.",
      };
  }
  return undefined;
}

function collectAudienceIssues(
  draft: AudienceDraft,
  context: AudienceDomainContext,
): AudienceDraftIssue[] {
  const issues: AudienceDraftIssue[] = [];
  const limitIssue = validateLimits(draft.root);
  if (limitIssue) issues.push(limitIssue);
  const visit = (node: AudienceDraftNode) => {
    if (node.kind === "all" || node.kind === "any") {
      if (!node.children.length)
        issues.push({
          code: "empty-group",
          nodeId: node.nodeId,
          message: "Добавьте хотя бы одно условие аудитории.",
        });
      node.children.forEach(visit);
    } else if (node.kind === "not") visit(node.child);
    else {
      const issue = validateLeaf(node, context);
      if (issue) issues.push(issue);
    }
  };
  visit(draft.root);
  return issues;
}

function serializeNode(
  node: AudienceDraftNode,
  path: string,
  index: Record<string, AudiencePathEntry>,
  version: 1 | 2,
): AudienceRuleDtoRoot | undefined {
  index[path] = { nodeId: node.nodeId, nodePath: path };
  if (node.kind === "opaque") return undefined;
  if (node.kind === "all" || node.kind === "any")
    return {
      kind: node.kind,
      children: node.children
        .map((child, childIndex) =>
          serializeNode(
            child,
            `${path}.children.${childIndex}`,
            index,
            version,
          ),
        )
        .filter((child): child is AudienceRuleDtoRoot => Boolean(child)),
    };
  if (node.kind === "not") {
    const child = serializeNode(node.child, `${path}.child`, index, version);
    return child ? { kind: "not", child } : undefined;
  }
  const value = clone(node) as unknown as Record<string, unknown>;
  delete value.nodeId;
  if (version === 2 && value.kind === "userAttribute")
    value.kind = "profileAttribute";
  return value as unknown as AudienceRuleDtoRoot;
}

export function serializeAudienceDraft(
  draft: AudienceDraft,
  context: AudienceDomainContext,
): AudienceSerializationResult {
  const issues = collectAudienceIssues(draft, context);
  if (issues.length) return { ok: false, issues };
  const pathIndex: Record<string, AudiencePathEntry> = {};
  const version = isV2(context) ? 2 : 1;
  const root = serializeNode(draft.root, "root", pathIndex, version);
  const freshnessHint =
    draft.freshness ??
    (version === 2 ? { mode: "USE_LAST_KNOWN" as const } : undefined);
  const freshness =
    version === 2 &&
    freshnessHint?.mode === "REQUIRE_FRESH" &&
    typeof freshnessHint.maxAgeSeconds === "number"
      ? {
          mode: "REQUIRE_FRESH" as const,
          maxAgeSeconds: freshnessHint.maxAgeSeconds,
        }
      : version === 2
        ? { mode: "USE_LAST_KNOWN" as const }
        : undefined;
  return root
    ? {
        ok: true,
        value: { version, ...(freshness ? { freshness } : {}), root },
        pathIndex,
      }
    : {
        ok: false,
        issues: [
          {
            code: "unsupported-node",
            nodeId: draft.root.nodeId,
            message: "Неподдерживаемое условие нужно заменить или удалить.",
          },
        ],
      };
}

function displayValue(value: AudienceLiteral | undefined): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === true) return "да";
  if (value === false) return "нет";
  return value === undefined ? "не задано" : String(value);
}

const operatorLabels: Record<string, string> = {
  eq: "равно",
  neq: "не равно",
  gt: "больше",
  gte: "не меньше",
  lt: "меньше",
  lte: "не больше",
  in: "одна из",
  not_in: "не входит в",
  exists: "заполнено",
  not_exists: "не заполнено",
  is_missing: "отсутствует",
  is_stale: "устарело",
};

function leafSummary(
  node: AudienceLeafDraftNode,
  context: AudienceDomainContext,
): string {
  if (node.kind === "segmentMembership") {
    const segment = context.segments.find(
      (candidate) => candidate.segmentId === node.segmentId,
    );
    const revisionLabel =
      segment?.currentRevision?.segmentRevisionId === node.segmentRevisionId
        ? `версия ${segment.currentRevision.revision}`
        : "предыдущая опубликованная версия";
    return `${node.operator === "is_member" ? "входит" : "не входит"} в сегмент «${segment?.name ?? node.segmentId}» (${revisionLabel})`;
  }
  const label =
    node.kind === "locale"
      ? "регион и язык"
      : node.kind === "language"
        ? "язык"
        : node.kind === "country"
          ? "страна"
          : (context.catalog.attributes.find(
              (attribute) => attribute.definitionId === node.definitionId,
            )?.label ?? node.definitionId);
  if (node.operator === "exists" || node.operator === "not_exists")
    return `${label} — ${operatorLabels[node.operator]}`;
  return `${label} — ${operatorLabels[node.operator] ?? node.operator} ${displayValue(node.value)}`;
}

export function summarizeAudience(
  draft: AudienceDraft,
  context: AudienceDomainContext,
): AudienceSummary {
  let nodes = 0;
  let leaves = 0;
  let segmentLeaves = 0;
  let sensitiveLeaves = 0;
  let hasOpaque = false;
  const byNodeId: Record<string, string> = {};
  const render = (node: AudienceDraftNode): string => {
    nodes += 1;
    let text: string;
    if (node.kind === "all" || node.kind === "any") {
      const children = node.children.map(render);
      text = children.length
        ? `${node.kind === "all" ? "Должны выполняться все условия" : "Достаточно одного условия"}: ${children.join("; ")}`
        : "Аудитория не ограничена";
    } else if (node.kind === "not") text = `Исключить, если: ${render(node.child)}`;
    else if (node.kind === "opaque") {
      hasOpaque = true;
      leaves += 1;
      text = `неподдерживаемое условие «${node.reportedKind ?? "неизвестное"}»`;
    } else {
      leaves += 1;
      if (node.kind === "segmentMembership") segmentLeaves += 1;
      if (node.kind === "userAttribute") {
        const attribute = catalogAttribute(context, node.definitionId);
        if (
          attribute &&
          ("sensitive" in attribute
            ? attribute.sensitive
            : attribute.classification === "SENSITIVE")
        )
          sensitiveLeaves += 1;
      }
      text = leafSummary(node, context);
    }
    byNodeId[node.nodeId] = text;
    return text;
  };
  const text = render(draft.root);
  const pristineEmpty =
    (draft.root.kind === "all" || draft.root.kind === "any") &&
    draft.root.children.length === 0;
  const invalid = collectAudienceIssues(draft, context).some(
    (issue) => issue.code !== "empty-group" || !pristineEmpty,
  );
  const status = hasOpaque
    ? "unsupported"
    : invalid
      ? "invalid"
      : pristineEmpty || leaves === 0
        ? "empty"
        : "ready";
  return {
    text,
    byNodeId,
    status,
    nodes,
    leaves,
    segmentLeaves,
    sensitiveLeaves,
  };
}

export function mapAudienceIssues(
  issues: AudienceIssueResponseDto[],
  index: AudiencePathIndex,
): MappedAudienceIssue[] {
  return issues.map((issue) => {
    const normalizedPath = issue.path.startsWith("audience.")
      ? issue.path.slice("audience.".length)
      : issue.path;
    const segments = normalizedPath.split(".");
    let entry: AudiencePathEntry | undefined;
    let nodePath = normalizedPath;
    while (segments.length) {
      const candidate = segments.join(".");
      if (index[candidate]) {
        entry = index[candidate];
        nodePath = candidate;
        break;
      }
      segments.pop();
    }
    return {
      ...issue,
      ...(entry
        ? {
            nodeId: entry.nodeId,
            fieldPath:
              normalizedPath === nodePath
                ? undefined
                : normalizedPath.slice(nodePath.length + 1),
          }
        : {}),
    };
  });
}

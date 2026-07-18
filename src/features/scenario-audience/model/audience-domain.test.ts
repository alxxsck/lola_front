import { describe, expect, it } from 'vitest'

import type { AudienceCatalogResponseDto } from '@/shared/api/generated/models'

import {
  applyAudienceCommand,
  createAudienceDraft,
  deserializeAudience,
  mapAudienceIssues,
  serializeAudienceDraft,
  summarizeAudience,
  type AudienceDomainContext,
} from './index'

const catalog: AudienceCatalogResponseDto = {
  version: 1,
  revision: 'audience-revision-7',
  locales: [
    { code: 'ru-RU', language: 'ru', label: 'Русский (Россия)' },
    { code: 'en-US', language: 'en', label: 'English (United States)' },
  ],
  localeSource: { operators: ['eq', 'neq', 'in', 'exists', 'not_exists'], control: 'SELECT', authoringAvailability: 'AVAILABLE' },
  languageSource: { operators: ['eq', 'neq', 'in', 'exists', 'not_exists'], control: 'SELECT', authoringAvailability: 'AVAILABLE' },
  country: {
    source: 'profile.country',
    valueType: 'countryCode',
    semantics: 'ISO_3166_1_ALPHA_2_UPPERCASE',
    operators: ['eq', 'neq', 'in', 'exists', 'not_exists'],
    control: 'COUNTRY_CODE',
    authoringAvailability: 'AVAILABLE',
  },
  attributes: [{
    definitionId: 'attribute-1',
    definitionRevisionId: 'attribute-revision-3',
    revision: 3,
    key: 'vipLevel',
    label: 'VIP-уровень',
    valueType: 'number',
    required: false,
    sensitive: true,
    operators: ['eq', 'gte', 'exists', 'not_exists'],
    control: 'NUMBER',
    authoringAvailability: 'AVAILABLE',
  }],
  segmentSource: {
    operators: ['is_member', 'is_not_member'],
    searchEndpoint: '/segments',
    control: 'SEARCH',
    authoringAvailability: 'AVAILABLE',
  },
  snapshotPolicy: {
    initialEvaluation: 'RUN_START',
    missingOrNull: 'NO_MATCH_EXCEPT_NOT_EXISTS',
    deletedDefinition: 'PINNED_SNAPSHOT_CONTINUES',
    unavailableSource: 'PUBLISH_REJECTED_EXPLAIN_UNAVAILABLE',
    segmentRevision: 'PINNED_REVISION',
    persistence: 'SNAPSHOT_WITH_SEPARATE_LAST_RECHECK',
    recheckTrigger: 'DELIVERY_RECHECK_ELIGIBILITY',
  },
}

const context: AudienceDomainContext = {
  catalog,
  segments: [{
    segmentId: 'segment-1',
    key: 'vip',
    name: 'VIP-пользователи',
    status: 'ACTIVE',
    currentRevision: {
      segmentRevisionId: 'segment-revision-2',
      revision: 2,
      catalogRevision: 'audience-revision-7',
      contentHash: 'hash',
      publishedAt: '2026-07-18T00:00:00.000Z',
    },
  }],
}

describe('Audience domain', () => {
  it('builds nested groups through commands and serializes stable typed identities', () => {
    let draft = createAudienceDraft()
    const rootId = draft.root.nodeId
    const locale = applyAudienceCommand(draft, { type: 'add', parentNodeId: rootId, leaf: { kind: 'locale', operator: 'eq', value: 'ru-RU' } }, context)
    expect(locale.ok).toBe(true)
    if (!locale.ok) return
    draft = locale.draft

    const attribute = applyAudienceCommand(draft, { type: 'add', parentNodeId: rootId, leaf: { kind: 'userAttribute', definitionId: 'attribute-1', operator: 'gte', value: 3 } }, context)
    expect(attribute.ok).toBe(true)
    if (!attribute.ok) return
    draft = attribute.draft

    const wrapped = applyAudienceCommand(draft, { type: 'wrapNot', nodeId: attribute.focusNodeId }, context)
    expect(wrapped.ok).toBe(true)
    if (!wrapped.ok) return

    const result = serializeAudienceDraft(wrapped.draft, context)
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 1,
        root: {
          kind: 'all',
          children: [
            { kind: 'locale', operator: 'eq', value: 'ru-RU' },
            { kind: 'not', child: { kind: 'userAttribute', definitionId: 'attribute-1', operator: 'gte', value: 3 } },
          ],
        },
      },
    })
    if (result.ok) expect(result.pathIndex['root.children.1.child']?.nodeId).toBe(attribute.focusNodeId)
  })

  it('pins an exact Segment revision and explains the audience in user language', () => {
    const source = {
      version: 1,
      root: {
        kind: 'any',
        children: [
          { kind: 'country', operator: 'in', value: ['ES', 'PT'] },
          { kind: 'segmentMembership', segmentId: 'segment-1', segmentRevisionId: 'segment-revision-2', operator: 'is_member' },
        ],
      },
    }
    const parsed = deserializeAudience(source, context)
    const serialized = serializeAudienceDraft(parsed.draft, context)

    expect(parsed.issues).toEqual([])
    expect(serialized).toMatchObject({ ok: true, value: source })
    expect(summarizeAudience(parsed.draft, context)).toMatchObject({
      status: 'ready',
      leaves: 2,
      segmentLeaves: 1,
      text: 'Хотя бы одно: страна — одна из ES, PT; входит в сегмент «VIP-пользователи» (версия 2)',
    })
  })

  it('maps a full-draft audience path back to the exact editor node', () => {
    const parsed = deserializeAudience({ version: 1, root: { kind: 'locale', operator: 'eq', value: 'ru-RU' } }, context)
    const serialized = serializeAudienceDraft(parsed.draft, context)
    if (!serialized.ok) throw new Error(serialized.issues[0]?.message)

    expect(mapAudienceIssues([
      { code: 'AUDIENCE_VALUE_INVALID', path: 'audience.root.value', message: 'Недопустимое значение' },
    ], serialized.pathIndex)[0]).toMatchObject({ nodeId: parsed.draft.root.nodeId, fieldPath: 'value' })
  })

  it('requires an array for the in operator, matching backend compilation', () => {
    const parsed = deserializeAudience({ version: 1, root: { kind: 'locale', operator: 'in', value: 'ru-RU' } }, context)
    const result = serializeAudienceDraft(parsed.draft, context)

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'in-requires-array', nodeId: parsed.draft.root.nodeId, fieldPath: 'value' })],
    })
  })

  it('marks an empty nested group as invalid instead of omitting a restrictive Audience', () => {
    const parsed = deserializeAudience({
      version: 1,
      root: { kind: 'all', children: [{ kind: 'locale', operator: 'eq', value: 'ru-RU' }, { kind: 'any', children: [] }] },
    }, context)

    expect(summarizeAudience(parsed.draft, context).status).toBe('invalid')
    expect(serializeAudienceDraft(parsed.draft, context)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'empty-group' })],
    })
  })

  it('keeps an unknown discriminated node visible and blocks publication without data loss', () => {
    const source = { version: 1, root: { kind: 'futureAudienceFact', stable: { value: 42 } } }
    const parsed = deserializeAudience(source, context)
    const result = serializeAudienceDraft(parsed.draft, context)

    expect(parsed.draft.root).toMatchObject({ kind: 'opaque', reportedKind: 'futureAudienceFact', source: source.root })
    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'unsupported-node', nodeId: parsed.draft.root.nodeId })],
    })
  })

  it('rejects stale catalog choices locally and maps backend paths to the exact card', () => {
    const parsed = deserializeAudience({ version: 1, root: { kind: 'userAttribute', definitionId: 'attribute-1', operator: 'gte', value: 3 } }, context)
    const staleContext: AudienceDomainContext = { ...context, catalog: { ...catalog, attributes: [] } }
    const result = serializeAudienceDraft(parsed.draft, staleContext)

    expect(result).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: 'attribute-unavailable', nodeId: parsed.draft.root.nodeId })],
    })

    const current = serializeAudienceDraft(parsed.draft, context)
    expect(current.ok).toBe(true)
    if (!current.ok) return
    expect(mapAudienceIssues([
      { code: 'AUDIENCE_VALUE_INVALID', path: 'root.value', message: 'Value is invalid' },
    ], current.pathIndex)).toEqual([
      expect.objectContaining({ nodeId: parsed.draft.root.nodeId, fieldPath: 'value' }),
    ])
  })
})

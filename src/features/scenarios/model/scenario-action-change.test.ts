import { describe, expect, it } from 'vitest';

import type { ScenarioAction, ScenarioActionCatalogItem } from '@/shared/types/domain';

import {
  planScenarioActionTypeReplacement,
  planScenarioEntryPointChange,
} from './scenario-action-change';

function definition(
  type: string,
  properties: ScenarioActionCatalogItem['configSchema']['properties'] = {},
): ScenarioActionCatalogItem {
  return {
    id: `action-${type}`,
    type,
    name: type,
    description: null,
    executor: 'SERVER',
    configSchema: {
      type: 'object',
      properties,
      required: [],
      additionalProperties: false,
    },
    uiSchema: {
      fields: Object.keys(properties).map((key) => ({ key, label: key, control: 'text' })),
    },
    enabled: true,
  };
}

describe('scenario first-action changes', () => {
  it('changes a linear entry point without connecting the old prefix after the selected branch', () => {
    const actions: ScenarioAction[] = [
      {
        position: 0,
        nodeKey: 'open_form',
        nextNodeKey: 'open_chat',
        type: 'OPEN_MODAL',
        config: {},
      },
      {
        position: 1,
        nodeKey: 'open_chat',
        nextNodeKey: 'say_hello',
        type: 'OPEN_CHAT',
        config: {},
      },
      {
        position: 2,
        nodeKey: 'say_hello',
        nextNodeKey: null,
        type: 'SAY',
        config: { text: 'Привет' },
      },
    ];

    const plan = planScenarioEntryPointChange(actions, 'open_chat');

    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;
    expect(plan.actions).toEqual([
      expect.objectContaining({ position: 0, nodeKey: 'open_chat', nextNodeKey: 'say_hello' }),
      expect.objectContaining({ position: 1, nodeKey: 'say_hello', nextNodeKey: null }),
    ]);
    expect(plan.unreachableNodeKeys).toEqual(['open_form']);
    expect(plan.removedIncomingTransitions).toEqual([
      expect.objectContaining({ source: 'open_form', target: 'open_chat' }),
    ]);
    expect(actions[0]).toMatchObject({ nextNodeKey: 'open_chat' });
  });

  it('explains why a branch target cannot become the entry point without invalidating its source', () => {
    const actions: ScenarioAction[] = [
      {
        position: 0,
        nodeKey: 'question',
        type: 'ASK_CHOICE',
        config: {
          message: 'Продолжить?',
          options: [{ id: 'yes', label: 'Да', nextNodeKey: 'answer' }],
          timeoutMs: 30_000,
          onTimeout: 'finish',
        },
      },
      { position: 1, nodeKey: 'answer', nextNodeKey: 'finish', type: 'SAY', config: {} },
      { position: 2, nodeKey: 'finish', nextNodeKey: null, type: 'COMPLETE_SCENARIO', config: {} },
    ];

    expect(planScenarioEntryPointChange(actions, 'answer')).toEqual({
      status: 'blocked',
      reason:
        'На «answer» ведёт обязательная ветка «Да» из «question». Сначала переназначьте эту ветку.',
    });
  });

  it('preserves compatible configuration and a linear transition when replacing a linear action', () => {
    const action: ScenarioAction = {
      position: 0,
      nodeKey: 'message',
      nextNodeKey: 'finish',
      type: 'SAY',
      config: { text: 'Привет', tone: 'warm' },
    };

    const plan = planScenarioActionTypeReplacement(
      action,
      definition('SEND_MESSAGE', {
        text: { type: 'string' },
        channel: { type: 'string', default: 'chat' },
      }),
      { channel: 'chat' },
    );

    expect(plan.replacement).toEqual({
      position: 0,
      nodeKey: 'message',
      nextNodeKey: 'finish',
      type: 'SEND_MESSAGE',
      config: { channel: 'chat', text: 'Привет' },
    });
    expect(plan.preservedConfigKeys).toEqual(['text']);
    expect(plan.removedConfigKeys).toEqual(['tone']);
    expect(plan.transitionImpact).toBe('preserved');
  });

  it('requires an explicit transition reset when the replacement contract is incompatible', () => {
    const action: ScenarioAction = {
      position: 0,
      nodeKey: 'question',
      nextNodeKey: null,
      type: 'ASK_CHOICE',
      config: {
        message: 'Продолжить?',
        options: [{ id: 'yes', label: 'Да', nextNodeKey: 'finish' }],
        onTimeout: 'finish',
      },
    };

    const plan = planScenarioActionTypeReplacement(
      action,
      definition('SAY', { text: { type: 'string', default: '' } }),
      { text: '' },
    );

    expect(plan.transitionImpact).toBe('reset-required');
    expect(plan.removedTransitionCount).toBe(2);
    expect(plan.replacement).toMatchObject({
      nodeKey: 'question',
      type: 'SAY',
      nextNodeKey: null,
      config: { text: '' },
    });
    expect(action.config).toHaveProperty('options');
  });

  it('does not preserve a same-typed field when the target schema rejects its value', () => {
    const target = definition('SEND_MESSAGE', {
      tone: { type: 'string', enum: ['neutral', 'formal'] },
    });
    target.configSchema.required = ['tone'];
    const plan = planScenarioActionTypeReplacement(
      {
        position: 0,
        nodeKey: 'message',
        nextNodeKey: null,
        type: 'SAY',
        config: { tone: 'warm' },
      },
      target,
      {},
    );

    expect(plan.preservedConfigKeys).toEqual([]);
    expect(plan.removedConfigKeys).toEqual(['tone']);
    expect(plan.requiredConfigKeys).toEqual(['tone']);
    expect(plan.replacement.config).toEqual({});
  });

  it('checks nested array items and required object properties before preserving config', () => {
    const target = definition('SEND_MESSAGE', {
      buttons: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string', minLength: 1 } },
          required: ['label'],
          additionalProperties: false,
        },
      },
      metadata: {
        type: 'object',
        properties: { campaign: { type: 'string' } },
        required: ['campaign'],
        additionalProperties: false,
      },
    });
    const plan = planScenarioActionTypeReplacement(
      {
        position: 0,
        nodeKey: 'message',
        nextNodeKey: null,
        type: 'SAY',
        config: {
          buttons: [{ label: '' }],
          metadata: { unexpected: 'legacy' },
        },
      },
      target,
      {},
    );

    expect(plan.preservedConfigKeys).toEqual([]);
    expect(plan.removedConfigKeys).toEqual(['buttons', 'metadata']);
  });

  it('shares object, empty-array and localized enum semantics with catalog validation', () => {
    const target = definition('SEND_MESSAGE', {
      metadata: { type: 'object' },
      tags: { type: 'array', minItems: 0 },
      tone: { type: 'string', enum: ['neutral', 'formal'] },
    });
    target.configSchema.required = ['tags', 'tone'];
    const plan = planScenarioActionTypeReplacement(
      {
        position: 0,
        nodeKey: 'message',
        nextNodeKey: null,
        type: 'SAY',
        config: {
          metadata: { legacy: true },
          tags: [],
          tone: { ru: 'formal', en: 'casual' },
        },
      },
      target,
      {},
      new Set(['tone']),
    );

    expect(plan.preservedConfigKeys).toEqual(['metadata', 'tags']);
    expect(plan.removedConfigKeys).toEqual(['tone']);
    expect(plan.requiredConfigKeys).toEqual(['tone']);
  });

  it('preserves locale maps only when the target action declares the field localizable', () => {
    const target = definition('SEND_MESSAGE', {
      text: { type: 'string', minLength: 1 },
    });
    const action = {
      position: 0,
      nodeKey: 'message',
      nextNodeKey: null,
      type: 'SAY',
      config: { text: { ru: 'Привет', en: 'Hello' } },
    };

    expect(planScenarioActionTypeReplacement(action, target, {}).removedConfigKeys).toEqual([
      'text',
    ]);
    expect(
      planScenarioActionTypeReplacement(action, target, {}, new Set(['text'])).preservedConfigKeys,
    ).toEqual(['text']);
  });

  it('uses visible target controls as the effective required-field policy', () => {
    const target = definition('OPEN_MODAL', {
      mode: { type: 'string', default: 'standard' },
      modalId: { type: 'string' },
      advancedCode: { type: 'string' },
    });
    target.configSchema.required = ['advancedCode'];
    target.uiSchema.fields = [
      { key: 'mode', label: 'Режим', control: 'select' },
      { key: 'modalId', label: 'Окно', control: 'target', targetKinds: ['MODAL'] },
      {
        key: 'advancedCode',
        label: 'Код',
        control: 'text',
        visibleWhen: { mode: 'advanced' },
      },
    ];
    const plan = planScenarioActionTypeReplacement(
      {
        position: 0,
        nodeKey: 'message',
        nextNodeKey: null,
        type: 'SAY',
        config: {},
      },
      target,
      { mode: 'standard' },
    );

    expect(plan.requiredConfigKeys).toEqual(['modalId']);
  });
});

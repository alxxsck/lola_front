import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  validateSupportSearchContract,
  validateSupportViewsContract,
} from './support-search-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function contract() {
  return JSON.parse(await readFile(path.join(root, 'openapi/retenive-backend.json'), 'utf8'));
}

function operation(document, operationId) {
  for (const pathItem of Object.values(document.paths))
    for (const value of Object.values(pathItem))
      if (value?.operationId === operationId) return value;
  throw new Error(`Missing ${operationId}`);
}

test('pinned Support Search contract is complete', async () => {
  const value = await contract();
  assert.doesNotThrow(() => validateSupportSearchContract(value));
});

test('Support Search rejects missing authority, result schemas and closed grammar', async () => {
  const mutations = [
    (value) => delete operation(value, 'SupportSearch_cases')['x-iam-permission'],
    (value) => delete operation(value, 'SupportSearch_messages').responses['200'],
    (value) => delete value.components.schemas.SupportCaseSearchQueryDto.properties.slaStates,
    (value) => {
      value.components.schemas.SupportSearchFreshnessResponseDto.properties.state.enum = ['READY'];
    },
    (value) => {
      value.components.schemas.SupportSearchCanonicalTargetResponseDto.required = ['kind'];
    },
  ];
  for (const mutate of mutations) {
    const value = await contract();
    mutate(value);
    assert.throws(() => validateSupportSearchContract(value));
  }
});

test('pinned Saved Views and System Views contract is complete', async () => {
  const value = await contract();
  assert.doesNotThrow(() => validateSupportViewsContract(value));
});

test('Saved Views reject missing OCC, authority and count grammar', async () => {
  const mutations = [
    (value) => delete operation(value, 'SavedSupportView_query')['x-iam-permission'],
    (value) => {
      operation(value, 'SavedSupportView_publish').parameters = [];
    },
    (value) => {
      value.components.schemas.SavedSupportViewCountResponseDto.properties.state.enum = ['EXACT'];
    },
  ];
  for (const mutate of mutations) {
    const value = await contract();
    mutate(value);
    assert.throws(() => validateSupportViewsContract(value));
  }
});

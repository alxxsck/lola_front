import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import filterDanglingOpenApiOperations from './filter-dangling-openapi-operations.mjs';

test('filters only operations whose schema references are absent from the pin', async () => {
  const document = JSON.parse(
    await readFile(new URL('../openapi/retenive-backend.json', import.meta.url)),
  );
  const filtered = filterDanglingOpenApiOperations(document);

  assert.equal(
    filtered.paths['/api/v1/admin/projects/{projectId}/users/{userId}/messages/outcome'].get
      .operationId,
    'AdminMessaging_lookupOutcome',
  );
  assert.equal(
    filtered.paths[
      '/api/v1/admin/projects/{projectId}/support/external-work/connections/{provider}/oauth/start'
    ].post.operationId,
    'SupportExternalConnection_startOAuth',
  );
  assert.equal(
    document.paths[
      '/api/v1/admin/projects/{projectId}/support/external-work/connections/{provider}/oauth/start'
    ].post.operationId,
    'SupportExternalConnection_startOAuth',
  );
});

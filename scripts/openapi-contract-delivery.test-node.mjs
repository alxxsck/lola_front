import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("production and Vercel builds cannot bypass the committed contract gate", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const vercel = JSON.parse(
    await readFile(path.join(repositoryRoot, "vercel.json"), "utf8"),
  );

  assert.match(packageJson.scripts.build, /npm run api:check/);
  assert.equal(vercel.buildCommand, "npm run build");
  assert.doesNotMatch(packageJson.scripts.build, /api:fetch|https?:\/\//u);
  assert.equal(packageJson.scripts["api:fetch"], undefined);
  assert.equal(packageJson.scripts["api:update"], undefined);
});

test("CI checks the committed artifact against an explicitly configured backend checkout", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github/workflows/openapi-contract.yml"),
    "utf8",
  );

  assert.match(workflow, /repository: alxxsck\/lola_back/u);
  assert.match(workflow, /LOLA_BACKEND_REF/u);
  assert.match(workflow, /vars\.LOLA_BACKEND_REF \|\| 'main'/u);
  assert.match(workflow, /secrets\.LOLA_BACKEND_READ_TOKEN/u);
  assert.match(workflow, /test -n "\$LOLA_BACKEND_READ_TOKEN"/u);
  assert.match(workflow, /LOLA_BACKEND_DIR/u);
  assert.match(workflow, /run: npm run api:check/u);
  assert.doesNotMatch(workflow, /curl|api:fetch|docs-json/u);
});

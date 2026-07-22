import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const checker = path.join(
  repositoryRoot,
  "scripts/check-backend-openapi-drift.mjs",
);

const baseDocument = {
  openapi: "3.0.0",
  paths: {
    "/api/v1/auth/login": {
      post: { operationId: "InitialAccess_login" },
    },
  },
  components: { schemas: { Login: { type: "object" } } },
};

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function fixture(snapshotDocument = baseDocument) {
  const root = await mkdtemp(path.join(tmpdir(), "lola-openapi-drift-"));
  const snapshot = path.join(root, "lola-backend.json");
  const metadata = path.join(root, "lola-backend.contract.json");
  const backendDocumentPath = path.join(root, "backend-openapi.json");
  const snapshotContent = `${JSON.stringify(snapshotDocument, null, 2)}\n`;
  await writeFile(snapshot, snapshotContent);
  await writeFile(
    metadata,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        backend: {
          repository: "alxxsck/lola_back",
        },
        artifact: path.basename(snapshot),
        contractRevision: `sha256:${digest(snapshotContent)}`,
        sha256: digest(snapshotContent),
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    backendDocumentPath,
    `${JSON.stringify(snapshotDocument, null, 2)}\n`,
  );
  return { backendDocumentPath, metadata, root, snapshot };
}

function runChecker({
  snapshot,
  metadata,
  backendDocumentPath,
  backendDirectory,
  backendRef,
  write = false,
  cwd,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        checker,
        "--snapshot",
        snapshot,
        "--metadata",
        metadata,
        ...(backendDocumentPath
          ? ["--backend-document", backendDocumentPath]
          : []),
        ...(backendDirectory ? ["--backend-directory", backendDirectory] : []),
        ...(backendRef ? ["--backend-ref", backendRef] : []),
        ...(write ? ["--write"] : []),
      ],
      {
        cwd: cwd ?? repositoryRoot,
        env: { ...process.env, LOLA_BACKEND_DIR: "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stderr, stdout }));
  });
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed: ${stderr}`));
    });
  });
}

test("standalone check verifies the committed artifact without a sibling backend", async () => {
  const paths = await fixture();
  const unrelatedCwd = await mkdtemp(path.join(tmpdir(), "lola-standalone-"));
  try {
    const result = await runChecker({
      ...paths,
      backendDocumentPath: undefined,
      cwd: unrelatedCwd,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Verified immutable Backend OpenAPI contract/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
    await rm(unrelatedCwd, { recursive: true, force: true });
  }
});

test("standalone check fails when contract metadata is missing", async () => {
  const paths = await fixture();
  const missingMetadata = path.join(paths.root, "missing-contract.json");
  try {
    const result = await runChecker({ ...paths, metadata: missingMetadata });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /contract metadata is required/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("standalone check fails when the committed artifact digest drifts", async () => {
  const paths = await fixture();
  await writeFile(
    paths.snapshot,
    `${JSON.stringify({ ...baseDocument, info: {} })}\n`,
  );
  try {
    const result = await runChecker(paths);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /artifact digest does not match/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("standalone check rejects contractRevision that is not the artifact content address", async () => {
  const paths = await fixture();
  const metadata = JSON.parse(await readFile(paths.metadata, "utf8"));
  metadata.contractRevision = `sha256:${"0".repeat(64)}`;
  await writeFile(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  try {
    const result = await runChecker({
      ...paths,
      backendDocumentPath: undefined,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /contract metadata is invalid/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("explicit backend input is compared independent of object key order", async () => {
  const paths = await fixture();
  await writeFile(
    paths.backendDocumentPath,
    `${JSON.stringify({
      components: baseDocument.components,
      paths: baseDocument.paths,
      openapi: baseDocument.openapi,
    })}\n`,
  );
  try {
    const result = await runChecker(paths);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /matches explicit Backend input/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("explicit backend drift fails and leaves the committed artifact untouched", async () => {
  const paths = await fixture();
  const changed = JSON.parse(JSON.stringify(baseDocument));
  changed.paths["/api/v1/auth/mfa"] = {
    post: { operationId: "IamMfa_login" },
  };
  await writeFile(
    paths.backendDocumentPath,
    `${JSON.stringify(changed, null, 2)}\n`,
  );
  const before = await readFile(paths.snapshot, "utf8");
  try {
    const result = await runChecker(paths);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not match the explicit Backend input/);
    assert.equal(await readFile(paths.snapshot, "utf8"), before);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("write mode requires an explicit backend source", async () => {
  const paths = await fixture();
  try {
    const result = await runChecker({
      ...paths,
      backendDocumentPath: undefined,
      write: true,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--write requires an explicit/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("write mode updates the artifact and digest and removes stale source revision", async () => {
  const paths = await fixture();
  const changed = JSON.parse(JSON.stringify(baseDocument));
  changed.paths["/api/v1/auth/mfa"] = {
    post: { operationId: "IamMfa_login" },
  };
  const staleMetadata = JSON.parse(await readFile(paths.metadata, "utf8"));
  staleMetadata.backendSourceRevision =
    "0123456789abcdef0123456789abcdef01234567";
  await writeFile(
    paths.metadata,
    `${JSON.stringify(staleMetadata, null, 2)}\n`,
  );
  await writeFile(
    paths.backendDocumentPath,
    `${JSON.stringify(changed, null, 2)}\n`,
  );
  try {
    const result = await runChecker({
      ...paths,
      write: true,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(paths.snapshot, "utf8")),
      changed,
    );
    const metadata = JSON.parse(await readFile(paths.metadata, "utf8"));
    assert.equal(metadata.sha256, digest(await readFile(paths.snapshot)));
    assert.equal(metadata.contractRevision, `sha256:${metadata.sha256}`);
    assert.equal(metadata.backendSourceRevision, undefined);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("write mode rejects a source revision that cannot be verified against a backend checkout", async () => {
  const paths = await fixture();
  try {
    const result = await runChecker({
      ...paths,
      backendRef: "0123456789abcdef0123456789abcdef01234567",
      write: true,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--backend-ref requires --backend-directory/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("write mode rejects a source revision that differs from backend HEAD", async () => {
  const paths = await fixture();
  const backendDirectory = path.join(paths.root, "backend");
  await runCommand("git", ["init", backendDirectory], paths.root);
  await runCommand(
    "git",
    ["config", "user.email", "contract-test@example.com"],
    backendDirectory,
  );
  await runCommand(
    "git",
    ["config", "user.name", "Contract Test"],
    backendDirectory,
  );
  await writeFile(path.join(backendDirectory, "marker"), "contract source\n");
  await runCommand("git", ["add", "marker"], backendDirectory);
  await runCommand(
    "git",
    ["commit", "-m", "contract source"],
    backendDirectory,
  );
  try {
    const result = await runChecker({
      ...paths,
      backendDirectory,
      backendDocumentPath: undefined,
      backendRef: "0000000000000000000000000000000000000000",
      write: true,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not match Backend checkout HEAD/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("an immutable metadata revision rejects a different explicit backend checkout", async () => {
  const paths = await fixture();
  const backendDirectory = path.join(paths.root, "backend");
  await writeFile(path.join(paths.root, "backend-marker"), "contract source\n");
  await runCommand("git", ["init", backendDirectory], paths.root);
  await runCommand(
    "git",
    ["config", "user.email", "contract-test@example.com"],
    backendDirectory,
  );
  await runCommand(
    "git",
    ["config", "user.name", "Contract Test"],
    backendDirectory,
  );
  await writeFile(path.join(backendDirectory, "marker"), "contract source\n");
  await runCommand("git", ["add", "marker"], backendDirectory);
  await runCommand(
    "git",
    ["commit", "-m", "contract source"],
    backendDirectory,
  );
  const metadata = JSON.parse(await readFile(paths.metadata, "utf8"));
  metadata.backendSourceRevision = "0000000000000000000000000000000000000000";
  await writeFile(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  try {
    const result = await runChecker({
      ...paths,
      backendDirectory,
      backendDocumentPath: undefined,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not match pinned contract revision/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("release metadata rejects a WORKTREE provenance sentinel", async () => {
  const paths = await fixture();
  const metadata = JSON.parse(await readFile(paths.metadata, "utf8"));
  metadata.backendSourceRevision = "WORKTREE_UNCOMMITTED";
  await writeFile(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  try {
    const result = await runChecker({
      ...paths,
      backendDocumentPath: undefined,
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /contract metadata is invalid/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

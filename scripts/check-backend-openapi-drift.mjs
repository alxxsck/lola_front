import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseArguments(argv) {
  let snapshot = path.join(repositoryRoot, "openapi/lola-backend.json");
  let metadata = path.join(
    repositoryRoot,
    "openapi/lola-backend.contract.json",
  );
  let backendDocument;
  let backendDirectory = process.env.LOLA_BACKEND_DIR
    ? path.resolve(process.env.LOLA_BACKEND_DIR)
    : undefined;
  let backendRef;
  let write = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write") write = true;
    else if (argument === "--snapshot") {
      snapshot = requiredPath(argv, ++index, "--snapshot");
    } else if (argument === "--metadata") {
      metadata = requiredPath(argv, ++index, "--metadata");
    } else if (argument === "--backend-document") {
      backendDocument = requiredPath(argv, ++index, "--backend-document");
    } else if (argument === "--backend-directory") {
      backendDirectory = requiredPath(argv, ++index, "--backend-directory");
    } else if (argument === "--backend-ref") {
      backendRef = argv[++index];
      if (!backendRef?.trim())
        throw new Error("--backend-ref requires a value");
    } else throw new Error(`Unknown argument: ${argument}`);
  }

  if (backendDocument && backendDirectory) {
    throw new Error(
      "Use either --backend-document or --backend-directory/LOLA_BACKEND_DIR, not both",
    );
  }
  if (write && !backendDocument && !backendDirectory) {
    throw new Error(
      "--write requires an explicit --backend-document or --backend-directory/LOLA_BACKEND_DIR",
    );
  }
  if (backendRef && !/^[0-9a-f]{40}$/u.test(backendRef)) {
    throw new Error(
      "--backend-ref must be a lowercase 40-character commit SHA",
    );
  }
  if (backendRef && !backendDirectory) {
    throw new Error(
      "--backend-ref requires --backend-directory/LOLA_BACKEND_DIR so the commit SHA can be verified",
    );
  }
  return {
    backendDirectory,
    backendDocument,
    backendRef,
    metadata,
    snapshot,
    write,
  };
}

function requiredPath(argv, index, option) {
  const value = argv[index];
  if (!value) throw new Error(`${option} requires a file path`);
  return path.resolve(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

function assertOpenApiDocument(document, source) {
  if (!document?.openapi || !document.paths || !document.components?.schemas) {
    throw new Error(`${source} is not a complete OpenAPI document`);
  }
}

function assertContractMetadata(metadata, snapshot) {
  if (
    metadata?.schemaVersion !== 1 ||
    metadata.backend?.repository !== "alxxsck/lola_back" ||
    metadata.artifact !== path.basename(snapshot) ||
    !/^[0-9a-f]{64}$/u.test(metadata.sha256 ?? "") ||
    metadata.contractRevision !== `sha256:${metadata.sha256}` ||
    (metadata.backendSourceRevision !== undefined &&
      !/^[0-9a-f]{40}$/u.test(metadata.backendSourceRevision))
  ) {
    throw new Error("Backend OpenAPI contract metadata is invalid");
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function run(command, args, cwd, failureLabel) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${failureLabel} failed with exit code ${code}`));
    });
  });
}

function capture(command, args, cwd, failureLabel) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(
          new Error(
            `${failureLabel} failed with exit code ${code}: ${stderr.trim()}`,
          ),
        );
    });
  });
}

async function assertPinnedBackendRevision(backendDirectory, metadata) {
  const expected = metadata.backendSourceRevision;
  if (!expected) return;
  const actual = await capture(
    "git",
    ["rev-parse", "HEAD"],
    backendDirectory,
    "Backend revision resolution",
  );
  if (actual !== expected) {
    throw new Error(
      `Explicit Backend checkout ${actual} does not match pinned contract revision ${expected}`,
    );
  }
}

async function assertRequestedBackendRevision(backendDirectory, expected) {
  if (!expected) return;
  const actual = await capture(
    "git",
    ["rev-parse", "HEAD"],
    backendDirectory,
    "Backend revision resolution",
  );
  if (actual !== expected) {
    throw new Error(
      `Requested Backend source revision ${expected} does not match Backend checkout HEAD ${actual}`,
    );
  }
}

async function exportBackendOpenApi(backendDirectory, target) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npm, ["run", "build"], backendDirectory, "Backend build");
  await run(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts/export-current-backend-openapi.mjs"),
      backendDirectory,
      target,
    ],
    backendDirectory,
    "Backend OpenAPI export",
  );
}

async function readDocument(file, source) {
  const document = JSON.parse(await readFile(file, "utf8"));
  assertOpenApiDocument(document, source);
  return document;
}

async function readMetadata(file, snapshot) {
  let metadata;
  try {
    metadata = JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    throw new Error(
      `Backend OpenAPI contract metadata is required at ${file}: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
  assertContractMetadata(metadata, snapshot);
  return metadata;
}

async function assertArtifactDigest(snapshot, metadata) {
  const content = await readFile(snapshot);
  const actual = sha256(content);
  if (actual !== metadata.sha256) {
    throw new Error(
      "Committed Backend OpenAPI artifact digest does not match its metadata. Run npm run api:sync:local and commit both files.",
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadata = await readMetadata(options.metadata, options.snapshot);
  await assertArtifactDigest(options.snapshot, metadata);

  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "lola-current-openapi-"),
  );
  const exportedDocumentPath =
    options.backendDocument ??
    path.join(temporaryDirectory, "lola-backend.json");

  try {
    if (options.backendDirectory) {
      if (options.write) {
        await assertRequestedBackendRevision(
          options.backendDirectory,
          options.backendRef,
        );
      } else {
        await assertPinnedBackendRevision(options.backendDirectory, metadata);
      }
      await exportBackendOpenApi(
        options.backendDirectory,
        exportedDocumentPath,
      );
    }

    if (!options.backendDocument && !options.backendDirectory) {
      await readDocument(options.snapshot, "Committed frontend artifact");
      console.log(
        `Verified immutable Backend OpenAPI contract ${metadata.contractRevision}`,
      );
      return;
    }

    const current = await readDocument(exportedDocumentPath, "Backend export");
    if (options.write) {
      const content = `${JSON.stringify(canonicalize(current), null, 2)}\n`;
      const baseMetadata = { ...metadata };
      delete baseMetadata.backendSourceRevision;
      await writeFile(options.snapshot, content, "utf8");
      await writeFile(
        options.metadata,
        `${JSON.stringify(
          {
            ...baseMetadata,
            ...(options.backendRef
              ? { backendSourceRevision: options.backendRef }
              : {}),
            contractRevision: `sha256:${sha256(content)}`,
            sha256: sha256(content),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      console.log(
        `Updated ${options.snapshot} and contract metadata from explicit Backend input`,
      );
      return;
    }

    const committed = await readDocument(
      options.snapshot,
      "Committed frontend artifact",
    );
    if (
      JSON.stringify(canonicalize(committed)) !==
      JSON.stringify(canonicalize(current))
    ) {
      throw new Error(
        "Committed frontend OpenAPI artifact does not match the explicit Backend input. Run npm run api:sync:local and commit the artifact, metadata and generated client.",
      );
    }
    console.log("Committed frontend artifact matches explicit Backend input");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});

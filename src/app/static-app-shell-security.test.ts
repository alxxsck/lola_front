// @vitest-environment node
/// <reference types="node" />

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const projectRoot = process.cwd();
const outputDirectory = mkdtempSync(join(tmpdir(), "lola-static-shell-"));
const automaticallyLoadedExternalAsset =
  /<(?:iframe|img|link|script|source|video)\b[^>]*\b(?:href|src)=["']https?:\/\//i;
const remoteStylesheetDependency =
  /@import\s+(?:url\()?\s*["']?https?:\/\/|url\(\s*["']?https?:\/\//i;

function readFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? readFiles(path) : [path];
  });
}

describe("static app shell security", () => {
  beforeAll(async () => {
    await build({
      root: projectRoot,
      configLoader: "runner",
      logLevel: "silent",
      build: {
        outDir: outputDirectory,
        emptyOutDir: true,
      },
    });
  }, 30_000);

  afterAll(() => {
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it("publishes a global no-referrer policy", () => {
    const html = readFileSync(join(outputDirectory, "index.html"), "utf8");

    expect(html).toMatch(
      /<meta\s+name=["']referrer["']\s+content=["']no-referrer["']\s*\/?>/i,
    );
  });

  it("does not load third-party fonts or automatic external assets", () => {
    const emittedFiles = readFiles(outputDirectory);
    const textAssets = emittedFiles.filter((file) =>
      [".css", ".html", ".js"].includes(extname(file)),
    );
    const emittedSource = textAssets
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const html = readFileSync(join(outputDirectory, "index.html"), "utf8");
    const styles = textAssets
      .filter((file) => extname(file) === ".css")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(emittedSource).not.toContain("fonts.googleapis.com");
    expect(emittedSource).not.toContain("fonts.gstatic.com");
    expect(styles).not.toMatch(/\b(?:DM Sans|Manrope)\b/);
    expect(styles).toContain("system-ui");
    expect(html).not.toMatch(automaticallyLoadedExternalAsset);
    expect(styles).not.toMatch(remoteStylesheetDependency);
  });
});

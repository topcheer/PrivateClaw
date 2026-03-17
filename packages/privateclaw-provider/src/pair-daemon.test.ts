import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolveCliInvocation } from "./pair-daemon.js";

test("resolveCliInvocation prefers the built dist cli when the source entry comes from src/", async (t) => {
  const packageRoot = await mkdtemp(
    path.join(os.tmpdir(), "privateclaw-pair-daemon-cli-"),
  );

  t.after(async () => {
    await rm(packageRoot, { recursive: true, force: true });
  });

  await mkdir(path.join(packageRoot, "src"), { recursive: true });
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await writeFile(path.join(packageRoot, "src", "cli.ts"), "export {};\n", "utf8");
  await writeFile(path.join(packageRoot, "dist", "cli.js"), "export {};\n", "utf8");

  const invocation = await resolveCliInvocation(
    pathToFileURL(path.join(packageRoot, "src", "cli.ts")).href,
  );

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [path.join(packageRoot, "dist", "cli.js")]);
});

test("resolveCliInvocation falls back to tsx when no built dist cli is present", async (t) => {
  const packageRoot = await mkdtemp(
    path.join(os.tmpdir(), "privateclaw-pair-daemon-cli-"),
  );

  t.after(async () => {
    await rm(packageRoot, { recursive: true, force: true });
  });

  await mkdir(path.join(packageRoot, "src"), { recursive: true });
  await writeFile(path.join(packageRoot, "src", "cli.ts"), "export {};\n", "utf8");

  const sourceCliPath = path.join(packageRoot, "src", "cli.ts");
  const invocation = await resolveCliInvocation(pathToFileURL(sourceCliPath).href);

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, ["--import", "tsx", sourceCliPath]);
});

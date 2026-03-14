import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadAvailableOpenClawCommands,
  resetOpenClawCommandDiscoveryForTests,
} from "./openclaw-command-discovery.js";

test("loadAvailableOpenClawCommands discovers built-in, skill, and plugin commands from hashed OpenClaw chunks", async (t) => {
  const openClawRoot = await mkdtemp(
    path.join(os.tmpdir(), "privateclaw-openclaw-root-"),
  );

  t.after(async () => {
    delete process.env.OPENCLAW_PACKAGE_ROOT;
    resetOpenClawCommandDiscoveryForTests();
    await rm(openClawRoot, { recursive: true, force: true });
  });

  await mkdir(path.join(openClawRoot, "dist"), { recursive: true });
  await writeFile(
    path.join(openClawRoot, "package.json"),
    JSON.stringify({
      name: "openclaw",
      type: "module",
    }),
  );
  await writeFile(
    path.join(openClawRoot, "dist", "index.js"),
    'import "./reply-test.js";\nimport "./registry-test.js";\n',
  );
  await writeFile(
    path.join(openClawRoot, "dist", "reply-test.js"),
    [
      'const BASE_COMMANDS = [',
      '  {',
      '    key: "help",',
      '    description: "Show help",',
      '    textAliases: ["/help"],',
      '    acceptsArgs: false,',
      '  },',
      '  {',
      '    key: "bash",',
      '    description: "Run bash",',
      '    textAliases: ["/bash"],',
      '    acceptsArgs: true,',
      '  },',
      "];",
      "function buildCommands(params) {",
      "  return [...BASE_COMMANDS, ...(params?.skillCommands ?? []).map((spec) => ({",
      '    key: `skill:${spec.skillName ?? spec.name}`,',
      "    description: spec.description,",
      '    textAliases: [`/${spec.name}`],',
      "    acceptsArgs: true,",
      "  }))];",
      "}",
      "export const cfg = function loadConfig() {",
      "  return { disableBash: true };",
      "};",
      "export const skills = function listSkillCommandsForAgents() {",
      '  return [{ name: "diagram", description: "Render a diagram", skillName: "diagram" }];',
      "};",
      "export const list = function listChatCommands(params) {",
      "  return buildCommands(params);",
      "};",
      "export const filtered = function listChatCommandsForConfig(config, params) {",
      "  const commands = buildCommands(params);",
      "  return config?.disableBash",
      '    ? commands.filter((command) => command.key !== "bash")',
      "    : commands;",
      "};",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(openClawRoot, "dist", "registry-test.js"),
    [
      "export const pluginSpecs = function getPluginCommandSpecs() {",
      "  return [",
      '    { name: "memory", description: "Search memory", acceptsArgs: true },',
      "  ];",
      "};",
      "",
    ].join("\n"),
  );

  process.env.OPENCLAW_PACKAGE_ROOT = openClawRoot;
  resetOpenClawCommandDiscoveryForTests();

  const commands = await loadAvailableOpenClawCommands();
  const slashes = commands.map((command) => command.slash);

  assert.deepEqual(slashes, ["/diagram", "/help", "/memory"]);
  assert.equal(
    commands.find((command) => command.slash === "/memory")?.source,
    "plugin",
  );
  assert.equal(
    commands.find((command) => command.slash === "/diagram")?.acceptsArgs,
    true,
  );
  assert.ok(
    commands.every((command) => command.slash !== "/bash"),
    "config-aware discovery should respect disabled commands",
  );
});

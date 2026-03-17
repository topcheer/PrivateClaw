import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceRoot = path.join(repoRoot, "apps/privateclaw_site");
const targetRoot = path.join(repoRoot, "services/relay-server/dist/web");

const entriesToCopy = [
  "assets",
  "chat",
  "index.html",
  "privacy",
  "scripts",
  "styles.css",
  "terms",
];

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

for (const entry of entriesToCopy) {
  await cp(
    path.join(sourceRoot, entry),
    path.join(targetRoot, entry),
    { recursive: true },
  );
}

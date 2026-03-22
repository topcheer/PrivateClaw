import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const marketingSourceRoot = path.join(repoRoot, "apps/privateclaw_site");
const marketingTargetRoot = path.join(repoRoot, "services/relay-server/dist/web");
const adminSourceRoot = path.join(repoRoot, "services/relay-server/src/admin-web");
const adminTargetRoot = path.join(repoRoot, "services/relay-server/dist/admin-web");

const marketingEntriesToCopy = [
  "assets",
  "chat",
  "index.html",
  "privacy",
  "scripts",
  "styles.css",
  "terms",
];

await rm(marketingTargetRoot, { recursive: true, force: true });
await rm(adminTargetRoot, { recursive: true, force: true });
await mkdir(marketingTargetRoot, { recursive: true });
await mkdir(adminTargetRoot, { recursive: true });

for (const entry of marketingEntriesToCopy) {
  await cp(
    path.join(marketingSourceRoot, entry),
    path.join(marketingTargetRoot, entry),
    { recursive: true },
  );
}

await cp(adminSourceRoot, adminTargetRoot, { recursive: true });

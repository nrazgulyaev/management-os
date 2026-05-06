/**
 * Prompt 113 — Static check that every storage bucket constant in code
 * appears in `docs/STORAGE-BUCKETS-CHECKLIST.md`.
 *
 * No network calls, no DB access — pure file scan.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const KNOWN_BUCKETS = [
  // Add new bucket constants here as the platform grows.
  "task-attachments",
  "guest-request-attachments",
];

function scanForBucketReferences(): Set<string> {
  const found = new Set<string>();
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        const body = readFileSync(p, "utf-8");
        for (const b of KNOWN_BUCKETS) {
          if (body.includes(`"${b}"`) || body.includes(`'${b}'`)) {
            found.add(b);
          }
        }
      }
    }
  }
  walk(join(repoRoot, "src"));
  return found;
}

const checklistPath = join(repoRoot, "docs/STORAGE-BUCKETS-CHECKLIST.md");
if (!existsSync(checklistPath)) {
  console.error(
    "✗ docs/STORAGE-BUCKETS-CHECKLIST.md is missing.  Restore it before deploying.",
  );
  process.exit(1);
}
const checklistBody = readFileSync(checklistPath, "utf-8");

const referenced = scanForBucketReferences();
let fatal = 0;
let warning = 0;
const lines: string[] = [];
lines.push("Storage bucket configuration check");
lines.push("===================================");
for (const b of KNOWN_BUCKETS) {
  const inCode = referenced.has(b);
  const inDocs = checklistBody.includes(b);
  if (inCode && !inDocs) {
    lines.push(`  ✗ "${b}" referenced in code but missing from checklist.`);
    fatal += 1;
  } else if (!inCode && inDocs) {
    lines.push(`  ! "${b}" documented but no code reference found.`);
    warning += 1;
  } else if (inCode && inDocs) {
    lines.push(`  ✓ "${b}" referenced in code + documented.`);
  } else {
    lines.push(`  ! "${b}" not referenced in code or docs.`);
    warning += 1;
  }
}
// Sensitive bucket extra check.
if (
  checklistBody.includes("guest-request-attachments") &&
  !/guest-request-attachments[\s\S]{0,400}private/i.test(checklistBody)
) {
  lines.push(
    "  ✗ guest-request-attachments must be documented as private / signed-URL only.",
  );
  fatal += 1;
}

// P114 — every documented bucket must have allowed-MIME + max-size + privacy.
for (const b of KNOWN_BUCKETS) {
  if (!checklistBody.includes(b)) continue;
  const lower = checklistBody.toLowerCase();
  if (!lower.includes("private")) {
    lines.push(`  ✗ Checklist must classify "${b}" privacy explicitly.`);
    fatal += 1;
  }
  if (!/allowed mime/i.test(checklistBody)) {
    lines.push(`  ✗ Checklist must list allowed MIME types per bucket.`);
    fatal += 1;
    break;
  }
  if (!/max size/i.test(checklistBody)) {
    lines.push(`  ✗ Checklist must list max size per bucket.`);
    fatal += 1;
    break;
  }
}

// P114 — public-bucket guard: nothing in src/ should reference a "public" bucket name.
const publicBucketTokens = ["public-attachments", "public-uploads"];
const allBody = (() => {
  let body = "";
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        body += readFileSync(p, "utf-8") + "\n";
      }
    }
  }
  walk(join(repoRoot, "src"));
  return body;
})();
for (const token of publicBucketTokens) {
  if (allBody.includes(`"${token}"`) || allBody.includes(`'${token}'`)) {
    lines.push(
      `  ✗ Public bucket name "${token}" referenced in src/ — buckets must be private.`,
    );
    fatal += 1;
  }
}
lines.push("");
lines.push(`Overall: ${fatal === 0 ? "OK" : "FAILED"} (${fatal} fatal, ${warning} warning)`);
console.log(lines.join("\n"));
process.exit(fatal === 0 ? 0 : 1);

export {};

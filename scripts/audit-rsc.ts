#!/usr/bin/env tsx
/**
 * STAB-1 Track E — standalone RSC boundary audit.
 *
 * Walks every server `.tsx` file under `src/`, parses with the
 * TypeScript compiler, and reports any JSX attribute on a known
 * `"use client"` component whose value is a function expression or a
 * local-function reference.
 *
 * Exit code: 0 if clean, 1 if any violations found.
 *
 * Same engine as `tests/sprint-hotfix-4-no-function-prop-on-rsc-boundary.test.ts`
 * — re-exported here as `npm run audit:rsc` so engineers can run it
 * outside the test runner (faster feedback while editing).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

const SAFE_ATTR_NAMES = new Set([
  "children",
  "key",
  "ref",
  "action",
  "formAction",
]);

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
}

function startsWithUseClient(src: string): boolean {
  return /^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(
    src,
  );
}

function hasExport(
  node: ts.FunctionDeclaration | ts.VariableStatement,
): boolean {
  return !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function buildClientRegistry(files: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!startsWithUseClient(src)) continue;
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    ts.forEachChild(sf, function visit(node) {
      if (ts.isFunctionDeclaration(node) && node.name && hasExport(node)) {
        map.set(node.name.text, file);
      } else if (ts.isVariableStatement(node) && hasExport(node)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) map.set(d.name.text, file);
        }
      } else if (
        ts.isExportDeclaration(node) &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const el of node.exportClause.elements) {
          map.set(el.name.text, file);
        }
      }
      ts.forEachChild(node, visit);
    });
  }
  return map;
}

function collectLocalFunctionNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  ts.forEachChild(sf, function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    else if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) ||
            ts.isFunctionExpression(d.initializer))
        ) {
          names.add(d.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  });
  return names;
}

interface Violation {
  file: string;
  line: number;
  tag: string;
  attr: string;
  kind: "arrow" | "function" | "local-function-ref";
}

function scanFile(
  file: string,
  src: string,
  clients: Map<string, string>,
): Violation[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const localFns = collectLocalFunctionNames(sf);
  const out: Violation[] = [];

  function inspect(
    opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  ): void {
    if (!ts.isIdentifier(opening.tagName)) return;
    const tag = opening.tagName.text;
    if (!clients.has(tag)) return;
    for (const attr of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attr)) continue;
      if (!attr.name || !ts.isIdentifier(attr.name)) continue;
      if (SAFE_ATTR_NAMES.has(attr.name.text)) continue;
      const init = attr.initializer;
      if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
      const e = init.expression;
      let kind: Violation["kind"] | null = null;
      if (ts.isArrowFunction(e)) kind = "arrow";
      else if (ts.isFunctionExpression(e)) kind = "function";
      else if (ts.isIdentifier(e) && localFns.has(e.text))
        kind = "local-function-ref";
      if (kind) {
        const { line } = sf.getLineAndCharacterOfPosition(opening.getStart(sf));
        out.push({ file, line: line + 1, tag, attr: attr.name.text, kind });
      }
    }
  }

  ts.forEachChild(sf, function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      inspect(node);
    }
    ts.forEachChild(node, visit);
  });
  return out;
}

function main(): void {
  const allTsx: string[] = [];
  walk(SRC, allTsx);
  const clients = buildClientRegistry(allTsx);
  const servers = allTsx.filter(
    (f) => !startsWithUseClient(readFileSync(f, "utf8")),
  );

  const violations: Violation[] = [];
  for (const file of servers) {
    const src = readFileSync(file, "utf8");
    violations.push(...scanFile(file, src, clients));
  }

  console.log(
    `RSC audit — scanned ${servers.length} server .tsx files, ${clients.size} client components in registry`,
  );

  if (violations.length === 0) {
    console.log("✓ no function-prop violations crossing the RSC boundary");
    process.exit(0);
  }

  console.error(`\n✗ found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(
      `  ${v.file.replace(ROOT + "/", "")}:${v.line} — <${v.tag} ${v.attr}={${v.kind}}>`,
    );
  }
  console.error(
    "\nFunctions cannot be serialized as Server Component → Client Component props.",
  );
  console.error(
    "See CONTRIBUTING.md for the three fix patterns (format-spec / ReactNode slot / move-to-client).",
  );
  process.exit(1);
}

main();

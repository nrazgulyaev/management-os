/**
 * Hotfix HF-4 — RSC boundary function-prop scanner.
 *
 * Generalisation of the HF-1 string-grep scanner. Walks the whole
 * src/app/ tree, parses every server component (file that doesn't
 * start with `"use client"`), and flags any JSX attribute whose
 * value is an inline arrow/function expression OR an identifier
 * pointing to a locally-defined function, when the JSX tag is the
 * name of a "use client" component declared anywhere under src/.
 *
 * Why: passing a function across the server→client boundary causes
 * "functions cannot be passed as Server Component → Client Component
 * props" — the same RSC crash class that HF-1 fixed for AreaChartCard.
 *
 * Known-safe attribute names (props the RSC runtime supports
 * crossing the boundary) are whitelisted: `children`, `key`, `ref`.
 *
 * Server-action-style props are also whitelisted: any prop name
 * matching /^(action|formAction)$/ — Next.js handles these via the
 * "use server" reference protocol.
 *
 * Identifiers are flagged only when the local declaration is a
 * regular function (FunctionDeclaration, VariableDeclaration where
 * initializer is ArrowFunctionExpression or FunctionExpression).
 * Constants, primitives, imported async server actions, etc. are
 * not flagged.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
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
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
}

function startsWithUseClient(src: string): boolean {
  // Strip leading whitespace + comments + the opening directive line.
  // Matches `"use client";`, `'use client';`, with or without semicolon
  // or trailing whitespace, as the first statement.
  return /^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(
    src,
  );
}

function buildClientComponentRegistry(): Map<string, string> {
  const all: string[] = [];
  walk(SRC, all);
  const map = new Map<string, string>();
  for (const file of all) {
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
          if (ts.isIdentifier(d.name)) {
            map.set(d.name.text, file);
          }
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

function hasExport(
  node: ts.FunctionDeclaration | ts.VariableStatement,
): boolean {
  return !!node.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword,
  );
}

interface Violation {
  file: string;
  line: number;
  tag: string;
  attr: string;
  kind: "arrow" | "function" | "local-function-ref";
}

function collectLocalFunctionNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  ts.forEachChild(sf, function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      names.add(node.name.text);
    } else if (ts.isVariableStatement(node)) {
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
  const violations: Violation[] = [];

  function inspectJsx(
    opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  ): void {
    if (!ts.isIdentifier(opening.tagName)) return;
    const tagName = opening.tagName.text;
    if (!clients.has(tagName)) return;

    for (const attr of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attr)) continue;
      if (!attr.name || !ts.isIdentifier(attr.name)) continue;
      const attrName = attr.name.text;
      if (SAFE_ATTR_NAMES.has(attrName)) continue;
      const init = attr.initializer;
      if (!init) continue;
      if (!ts.isJsxExpression(init)) continue;
      const expr = init.expression;
      if (!expr) continue;

      let kind: Violation["kind"] | null = null;
      if (ts.isArrowFunction(expr)) {
        kind = "arrow";
      } else if (ts.isFunctionExpression(expr)) {
        kind = "function";
      } else if (ts.isIdentifier(expr) && localFns.has(expr.text)) {
        kind = "local-function-ref";
      }

      if (kind) {
        const { line } = sf.getLineAndCharacterOfPosition(opening.getStart(sf));
        violations.push({
          file,
          line: line + 1,
          tag: tagName,
          attr: attrName,
          kind,
        });
      }
    }
  }

  ts.forEachChild(sf, function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      inspectJsx(node);
    }
    ts.forEachChild(node, visit);
  });

  return violations;
}

const clientRegistry = buildClientComponentRegistry();

// Scan ALL .tsx files that aren't "use client" — not just src/app/.
// A server component anywhere (e.g. src/components/dashboard/...) can
// render a client component and pass a function across the boundary
// just as readily as a page.tsx can.
const allTsxFiles: string[] = [];
walk(SRC, allTsxFiles);
const serverPagesWithoutUseClient = allTsxFiles.filter((f) => {
  const src = readFileSync(f, "utf8");
  return !startsWithUseClient(src);
});

const allViolations: Violation[] = [];
for (const file of serverPagesWithoutUseClient) {
  const src = readFileSync(file, "utf8");
  const violations = scanFile(file, src, clientRegistry);
  allViolations.push(...violations);
}

test("HF-4: no function-valued props passed from server pages to use-client components", () => {
  if (allViolations.length > 0) {
    const summary = allViolations
      .map(
        (v) =>
          `  ${v.file.replace(ROOT + "/", "")}:${v.line} — <${v.tag} ${v.attr}={${v.kind}}>`,
      )
      .join("\n");
    assert.fail(
      `Found ${allViolations.length} function-as-prop violation(s) crossing the RSC boundary:\n${summary}\n\n` +
        `Functions cannot be serialized as Server Component → Client Component props. ` +
        `Fix patterns: (1) move the function to the client component itself, (2) replace with a ` +
        `format-spec string union resolved client-side, or (3) accept a ReactNode slot instead.`,
    );
  }
});

test("HF-4: client component registry populated (sanity)", () => {
  // Spot-check a few known client components are registered. If this
  // fails, the scanner itself is broken and the main test is meaningless.
  for (const name of [
    "BankAccountModalForm",
    "EntityModal",
    "AreaChartCard",
  ]) {
    assert.ok(
      clientRegistry.has(name),
      `client registry missing ${name} — scanner may not be working`,
    );
  }
});

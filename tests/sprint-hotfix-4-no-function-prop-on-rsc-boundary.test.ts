/**
 * Hotfix HF-4 + HF-12 — RSC boundary scanner.
 *
 * Walks the whole src/ tree, parses every server component (file
 * that doesn't start with `"use client"`), and flags any JSX
 * attribute on a known `"use client"` component whose value is one
 * of:
 *
 *   - an inline arrow / function expression          (HF-1 / HF-4)
 *   - a locally-defined function identifier          (HF-4)
 *   - an imported PascalCase identifier (forwardRef) (HF-12 direct)
 *   - an imported identifier whose source module     (HF-12 indirect)
 *     bakes `{ icon: ComponentRef }` into its export
 *
 * Why: these values can't cross the Server Component → Client
 * Component boundary — RSC serialization throws "functions cannot
 * be passed…" (HF-1) or "Cannot serialize a forwardRef…" (HF-12).
 *
 * Known-safe attribute names (props the RSC runtime supports
 * crossing the boundary) are whitelisted: children, key, ref,
 * action, formAction.
 *
 * This test imports the scanner from scripts/audit-rsc.ts indirectly
 * — they share inlined logic. Whenever you update the scanner there,
 * mirror the change here.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
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
const SUSPICIOUS_DATA_KEYS = new Set([
  "icon",
  "Icon",
  "component",
  "Component",
  "render",
]);
const PASCAL_CASE = /^[A-Z][a-z]/;

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
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
    if (!file.endsWith(".tsx")) continue;
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

interface ImportInfo {
  name: string;
  source: string;
}

function collectImports(sf: ts.SourceFile): Map<string, ImportInfo> {
  const out = new Map<string, ImportInfo>();
  ts.forEachChild(sf, (node) => {
    if (!ts.isImportDeclaration(node) || !node.importClause) return;
    const clause = node.importClause;
    if (clause.isTypeOnly) return;
    const source =
      ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text;
    if (!source) return;
    if (clause.name)
      out.set(clause.name.text, { name: clause.name.text, source });
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        out.set(clause.namedBindings.name.text, {
          name: clause.namedBindings.name.text,
          source,
        });
      } else {
        for (const el of clause.namedBindings.elements) {
          if (el.isTypeOnly) continue;
          out.set(el.name.text, { name: el.name.text, source });
        }
      }
    }
  });
  return out;
}

interface Violation {
  file: string;
  line: number;
  tag: string;
  attr: string;
  kind:
    | "arrow"
    | "function"
    | "local-function-ref"
    | "component-ref"
    | "component-via-config";
  identifier?: string;
  via?: string;
}

function findComponentRefs(
  expr: ts.Expression,
  imported: Map<string, ImportInfo>,
  localFns: Set<string>,
): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      PASCAL_CASE.test(node.text) &&
      imported.has(node.text) &&
      !localFns.has(node.text)
    ) {
      const parent = node.parent;
      if (parent && ts.isPropertyAssignment(parent) && parent.name === node) {
        return;
      }
      if (
        parent &&
        (ts.isJsxOpeningElement(parent) ||
          ts.isJsxSelfClosingElement(parent) ||
          ts.isJsxClosingElement(parent)) &&
        parent.tagName === node
      ) {
        return;
      }
      const sf = node.getSourceFile();
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({ name: node.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(expr);
  return out;
}

function resolveLocalModule(
  fromFile: string,
  specifier: string,
): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = join(dirname(fromFile), specifier);
  } else {
    return null;
  }
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base.endsWith(ext) ? base : base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

interface BakedComponent {
  identifier: string;
  line: number;
  exportName: string | null;
}

function scanModuleForBakedComponents(file: string): BakedComponent[] {
  const src = readFileSync(file, "utf8");
  if (startsWithUseClient(src)) return [];
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = collectImports(sf);
  if (imports.size === 0) return [];
  const out: BakedComponent[] = [];
  function nearestExportName(node: ts.Node): string | null {
    let cur: ts.Node | undefined = node;
    while (cur) {
      if (ts.isVariableStatement(cur) && hasExport(cur)) {
        for (const d of cur.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) return d.name.text;
        }
      }
      if (ts.isFunctionDeclaration(cur) && hasExport(cur) && cur.name) {
        return cur.name.text;
      }
      cur = cur.parent;
    }
    return null;
  }
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      SUSPICIOUS_DATA_KEYS.has(node.name.text) &&
      ts.isIdentifier(node.initializer) &&
      PASCAL_CASE.test(node.initializer.text) &&
      imports.has(node.initializer.text)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      out.push({
        identifier: node.initializer.text,
        line: line + 1,
        exportName: nearestExportName(node),
      });
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sf, visit);
  return out;
}

const configScanCache = new Map<string, BakedComponent[]>();
function getConfigBaked(file: string): BakedComponent[] {
  let v = configScanCache.get(file);
  if (v === undefined) {
    v = scanModuleForBakedComponents(file);
    configScanCache.set(file, v);
  }
  return v;
}

function scanServerTsx(
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
  const imports = collectImports(sf);
  const out: Violation[] = [];

  function checkIndirectConfig(
    expr: ts.Expression,
    line: number,
    tag: string,
    attr: string,
  ): void {
    if (!ts.isIdentifier(expr)) return;
    const imp = imports.get(expr.text);
    if (!imp) return;
    const resolved = resolveLocalModule(file, imp.source);
    if (!resolved) return;
    const baked = getConfigBaked(resolved);
    if (baked.length === 0) return;
    const matching = baked.filter(
      (b) => b.exportName === null || b.exportName === expr.text,
    );
    for (const b of matching) {
      out.push({
        file,
        line,
        tag,
        attr,
        kind: "component-via-config",
        identifier: b.identifier,
        via: `${resolved.replace(ROOT + "/", "")}:${b.line}`,
      });
    }
  }

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
      const { line } = sf.getLineAndCharacterOfPosition(opening.getStart(sf));
      const attrName = attr.name.text;

      if (ts.isArrowFunction(e)) {
        out.push({ file, line: line + 1, tag, attr: attrName, kind: "arrow" });
        continue;
      }
      if (ts.isFunctionExpression(e)) {
        out.push({
          file,
          line: line + 1,
          tag,
          attr: attrName,
          kind: "function",
        });
        continue;
      }
      if (ts.isIdentifier(e) && localFns.has(e.text)) {
        out.push({
          file,
          line: line + 1,
          tag,
          attr: attrName,
          kind: "local-function-ref",
        });
        continue;
      }
      const refs = findComponentRefs(e, imports, localFns);
      for (const r of refs) {
        out.push({
          file,
          line: r.line,
          tag,
          attr: attrName,
          kind: "component-ref",
          identifier: r.name,
        });
      }
      checkIndirectConfig(e, line + 1, tag, attrName);
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

// === Run the audit against src/ ===
const allFiles: string[] = [];
walk(SRC, allFiles);
const tsxFiles = allFiles.filter((f) => f.endsWith(".tsx"));
const clientRegistry = buildClientRegistry(tsxFiles);
const serverPages = tsxFiles.filter(
  (f) => !startsWithUseClient(readFileSync(f, "utf8")),
);

const allViolations: Violation[] = [];
for (const file of serverPages) {
  const src = readFileSync(file, "utf8");
  allViolations.push(...scanServerTsx(file, src, clientRegistry));
}

test("HF-4 + HF-12: no function/component-ref/config-baked props cross the RSC boundary", () => {
  if (allViolations.length > 0) {
    const summary = allViolations
      .map((v) => {
        const id = v.identifier ? `=${v.identifier}` : "";
        const via = v.via ? ` (via ${v.via})` : "";
        return `  ${v.file.replace(ROOT + "/", "")}:${v.line} — <${v.tag} ${v.attr}={${v.kind}${id}}>${via}`;
      })
      .join("\n");
    assert.fail(
      `Found ${allViolations.length} RSC-boundary violation(s):\n${summary}\n\n` +
        `Functions, forwardRef component refs, and configs that bake icons into ` +
        `exports cannot serialize as Server Component → Client Component props. ` +
        `Fix patterns: format-spec string union, ReactNode slot, string-key + ` +
        `client-side registry lookup, or move the call site into the client component.`,
    );
  }
});

test("HF-4 + HF-12: client component registry populated (sanity)", () => {
  for (const name of [
    "BankAccountModalForm",
    "EntityModal",
    "AreaChartCard",
    "MobileTabbar",
  ]) {
    assert.ok(
      clientRegistry.has(name),
      `client registry missing ${name} — scanner may not be working`,
    );
  }
});

test("HF-12: scanner catches direct component-ref fixture", () => {
  const fixture = resolve(
    HERE,
    "fixtures/rsc-violations/icon-as-prop.tsx",
  );
  if (!existsSync(fixture)) {
    assert.fail(`fixture missing: ${fixture}`);
  }
  // Inject a synthetic "use client" component named FixtureClient into a
  // throwaway registry so the scanner has something to flag against.
  const fixtureClients = new Map(clientRegistry);
  fixtureClients.set("FixtureClient", "(fixture)");
  const src = readFileSync(fixture, "utf8");
  const found = scanServerTsx(fixture, src, fixtureClients);
  const componentRefs = found.filter((v) => v.kind === "component-ref");
  const viaConfig = found.filter((v) => v.kind === "component-via-config");
  assert.ok(
    componentRefs.length > 0,
    `expected ≥1 component-ref violation in fixture, got: ${JSON.stringify(found)}`,
  );
  assert.ok(
    viaConfig.length > 0,
    `expected ≥1 component-via-config violation in fixture, got: ${JSON.stringify(found)}`,
  );
});

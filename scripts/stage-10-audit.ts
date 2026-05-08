/**
 * Stage 10.A — UX/CRUD audit harness.
 *
 * Extends scripts/audit-production-pages.ts with the deeper signals
 * the Stage 10.A prompt asks for. Single-pass per page, authenticated,
 * captures:
 *
 *   1. HTTP / TTI / console errors (existing)
 *   2. Stage-label leakage in visible UI (e.g. "5.F", "4.A", "Phase 9.B")
 *   3. Developer-instruction leakage ("npm run", "db:seed", "tsx scripts")
 *   4. "Next Wave" / "Roadmap" / "Coming soon" badges
 *   5. CRUD affordance counts: Add / Edit / Delete buttons present?
 *   6. Modal-add vs page-add heuristic: does Add button open a Dialog?
 *   7. Empty-state quality: helpful copy + CTA, or bare placeholder
 *   8. Confirmation-on-delete pattern: presence of confirm dialog markup
 *   9. Page-level screenshot to tmp/stage-10-screenshots/{slug}.webp
 *
 * Output: tmp/stage-10-audit-results.json (typed).
 *
 * Usage:
 *   npx tsx scripts/stage-10-audit.ts --auth \
 *     [--urls=tmp/stage-10-urls.txt] \
 *     [--out=tmp/stage-10-audit-results.json] \
 *     [--screenshots=tmp/stage-10-screenshots] \
 *     [--concurrency=3] [--timeout=30000]
 *
 * Operator credentials live in .env.audit.local (gitignored).
 *   AUDIT_BOT_EMAIL / AUDIT_BOT_PASSWORD must be set before invocation:
 *     export $(grep -v '^#' .env.audit.local | xargs) && \
 *       npx tsx scripts/stage-10-audit.ts --auth ...
 *
 * Read-only: this script does not click any Add/Edit/Delete buttons,
 * does not submit forms, does not POST to any endpoint. It reads the
 * DOM only.
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
} from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

interface Args {
  base: string;
  urlsFile: string;
  outFile: string;
  screenshotDir: string;
  concurrency: number;
  timeoutMs: number;
  auth: boolean;
  authEmail?: string;
  authPassword?: string;
  resume: boolean;
}

function parseArgs(): Args {
  const flags = new Set<string>();
  const args = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const kv = a.match(/^--([^=]+)=(.*)$/);
    if (kv) args.set(kv[1]!, kv[2]!);
    else if (a.startsWith("--")) flags.add(a.slice(2));
  }
  return {
    base: args.get("base") ?? "https://management-os-fawn.vercel.app",
    urlsFile: args.get("urls") ?? resolve(ROOT, "tmp/stage-10-urls.txt"),
    outFile:
      args.get("out") ?? resolve(ROOT, "tmp/stage-10-audit-results.json"),
    screenshotDir:
      args.get("screenshots") ?? resolve(ROOT, "tmp/stage-10-screenshots"),
    concurrency: Number(args.get("concurrency") ?? "3"),
    timeoutMs: Number(args.get("timeout") ?? "30000"),
    auth: flags.has("auth"),
    authEmail: process.env.AUDIT_BOT_EMAIL,
    authPassword: process.env.AUDIT_BOT_PASSWORD,
    resume: flags.has("resume"),
  };
}

interface CrudAffordances {
  addButtons: string[]; // labels
  editButtons: number;
  deleteButtons: number;
  addOpensDialog: boolean | null; // null = couldn't infer
  hasInlineForm: boolean;
}

interface UxFindings {
  stageLabels: string[]; // e.g. ["5.F", "Phase 9.B"]
  devLeaks: string[]; // e.g. ["npm run db:seed"]
  nextWaveBadges: string[]; // e.g. ["Coming soon", "Next Wave"]
  emptyStateText: string | null;
  emptyStateHasCta: boolean;
  hasConfirmPattern: boolean; // any element matching common confirm text
  hasBreadcrumb: boolean;
  brandingMentions: string[]; // "Arconique Management OS", etc.
}

interface PageResult {
  url: string;
  finalUrl: string;
  status: number | null;
  redirectedToLogin: boolean;
  renderTimeMs: number;
  consoleErrors: string[];
  networkErrors: { url: string; status: number; type: string }[];
  pageTitle: string;
  hasH1: boolean;
  hasTable: boolean;
  hasForm: boolean;
  bodyLen: number;
  crud: CrudAffordances;
  ux: UxFindings;
  screenshot?: string;
  verdict:
    | "USABLE"
    | "PARTIAL"
    | "BROKEN"
    | "MISSING"
    | "NEEDS-AUTH"
    | "DEFERRED"
    | "EMPTY-OK"
    | "EMPTY-LEAKY";
  notes: string;
}

const ERROR_MARKERS = [
  /An error occurred while rendering/i,
  /Server Components render/i,
  /Application error: a server-side exception/i,
  /500: Internal Server Error/i,
  /This page could not be found/i,
];

const STAGE_LABEL_RE =
  /\b(?:Phase\s+|Stage\s+)?(?:\d+\.[A-Z](?:\.\d+)?)\b/g;
const DEV_LEAK_PATTERNS = [
  /npm\s+run\s+[\w:-]+/gi,
  /pnpm\s+(?:run\s+)?[\w:-]+/gi,
  /yarn\s+[\w:-]+/gi,
  /tsx\s+scripts\//gi,
  /db:seed\b/gi,
  /db:migrate\b/gi,
  /node\s+--env-file/gi,
  /\.env\.(?:local|production)/gi,
  /supabase\s+(?:db|gen)/gi,
  /drizzle-kit/gi,
  /TODO[: ]/g,
  /FIXME[: ]/g,
];
const NEXT_WAVE_PATTERNS = [
  /next\s+wave/gi,
  /coming\s+soon/gi,
  /roadmap[^.\n]{0,40}(?:soon|not\s+built|deferred)/gi,
  /not\s+yet\s+(?:built|available|implemented)/gi,
  /will\s+ship\s+in\s+stage/gi,
  /\bsoon\b(?=[\s.,)])/gi,
];
const CONFIRM_PATTERNS =
  /(?:are\s+you\s+sure|confirm\s+(?:delete|removal)|this\s+cannot\s+be\s+undone)/i;
const BRAND_PATTERNS = [
  /Arconique(?:\s+(?:Management|Development))?\s+OS/gi,
  /\bArconique\b/g,
];

async function loginAuditBot(
  ctx: BrowserContext,
  base: string,
  email: string,
  password: string,
  timeoutMs: number,
): Promise<void> {
  const page = await ctx.newPage();
  try {
    await page.goto(`${base.replace(/\/$/, "")}/login`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForSelector('input[name="email"]', { timeout: timeoutMs });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForURL(
        (url) => !/\/login\b/.test(new URL(url).pathname),
        { timeout: timeoutMs },
      ),
      page.click('button[type="submit"]'),
    ]);
    const finalPath = new URL(page.url()).pathname;
    if (/\/login\b/.test(finalPath)) {
      throw new Error(`login submission did not redirect; still on ${finalPath}`);
    }
    console.log(`[stage-10-audit] login OK as ${email} → ${finalPath}`);
  } finally {
    await page.close();
  }
}

function loadUrls(file: string): string[] {
  const txt = readFileSync(file, "utf8");
  return txt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("/"));
}

async function inspectPage(page: Page): Promise<{
  bodyText: string;
  pageTitle: string;
  hasH1: boolean;
  hasTable: boolean;
  hasForm: boolean;
  crud: CrudAffordances;
  ux: UxFindings;
}> {
  const pageTitle = await page.title().catch(() => "");
  const bodyText = await page
    .evaluate(() => document.body?.innerText ?? "")
    .catch(() => "");
  const hasH1 = (await page.locator("h1").count()) > 0;
  const hasTable = (await page.locator("table").count()) > 0;
  const hasForm = (await page.locator("form").count()) > 0;

  // Affordances — count by aria-label / button text. We DO NOT click.
  const allButtonTexts: string[] = await page
    .locator("button, a[role='button'], a")
    .evaluateAll((els) =>
      els
        .map((e) => ((e as HTMLElement).innerText ?? "").trim())
        .filter((t) => t.length > 0 && t.length < 80),
    )
    .catch(() => [] as string[]);

  const addButtons = allButtonTexts.filter((t) =>
    /^(\+\s*|Add\b|Create\b|New\b|Invite\b|Generate\b|Connect\b|Upload\b)/i.test(
      t,
    ),
  );
  const editButtons = allButtonTexts.filter((t) =>
    /^(Edit\b|Rename\b|Update\b)/i.test(t),
  ).length;
  const deleteButtons = allButtonTexts.filter((t) =>
    /^(Delete\b|Remove\b|Archive\b|Revoke\b|Disable\b|Cancel\s+(?:subscription|booking|hold))/i.test(
      t,
    ),
  ).length;

  // Heuristic: if any visible button labelled "Add"/"New"/"Create" has
  // aria-haspopup="dialog" OR data-state attribute (radix dialog) we
  // treat the page as modal-add. Otherwise check if a route like
  // /<path>/new or an inline form is present (non-modal).
  let addOpensDialog: boolean | null = null;
  if (addButtons.length > 0) {
    const dialogAdd = await page
      .locator(
        'button[aria-haspopup="dialog"]:visible, [data-state]:has-text("Add")',
      )
      .count()
      .catch(() => 0);
    const linkAdd = await page
      .locator('a[href$="/new"]:visible, a:has-text("Add"):visible')
      .count()
      .catch(() => 0);
    if (dialogAdd > 0 && linkAdd === 0) addOpensDialog = true;
    else if (linkAdd > 0 && dialogAdd === 0) addOpensDialog = false;
    else if (dialogAdd > 0 && linkAdd > 0) addOpensDialog = true; // mixed but at least one modal
    else addOpensDialog = null;
  }

  const hasInlineForm =
    hasForm &&
    (await page
      .locator('main form input:not([type="hidden"]):not([type="search"])')
      .count()
      .catch(() => 0)) > 0;

  // Stage labels.
  const stageLabels = Array.from(
    new Set(bodyText.match(STAGE_LABEL_RE) ?? []),
  )
    .filter(
      // Filter out things that look like version numbers or section
      // numbers in unrelated content. Stage labels are specifically
      // "X.Y" or "X.Y.N" patterns where Y is uppercase A-N.
      (s) => /^\d+\.[A-N](?:\.\d+)?$/.test(s) || /^Phase\s+\d+\.[A-N]$/.test(s) || /^Stage\s+\d+\.[A-N]$/.test(s),
    )
    .slice(0, 20);

  const devLeaks: string[] = [];
  for (const re of DEV_LEAK_PATTERNS) {
    const matches = bodyText.match(re);
    if (matches) for (const m of matches) devLeaks.push(m);
  }
  const dedupedDevLeaks = Array.from(new Set(devLeaks)).slice(0, 10);

  const nextWaveBadges: string[] = [];
  for (const re of NEXT_WAVE_PATTERNS) {
    const matches = bodyText.match(re);
    if (matches) for (const m of matches) nextWaveBadges.push(m.trim());
  }
  const dedupedNextWave = Array.from(new Set(nextWaveBadges)).slice(0, 10);

  // Empty-state extraction.
  const emptyStateText = await page
    .locator(
      '[data-empty], [class*="empty-state"]:visible, p:has-text("No "):visible',
    )
    .first()
    .innerText({ timeout: 1000 })
    .catch(() => "");
  const trimmedEmpty = emptyStateText.trim().slice(0, 240);
  const emptyStateHasCta =
    trimmedEmpty.length > 0 && addButtons.length > 0;

  const hasConfirmPattern = CONFIRM_PATTERNS.test(bodyText);

  const hasBreadcrumb =
    (await page
      .locator('nav[aria-label*="readcrumb" i], [class*="breadcrumb"]:visible')
      .count()
      .catch(() => 0)) > 0;

  const brandingMentions = new Set<string>();
  for (const re of BRAND_PATTERNS) {
    const matches = bodyText.match(re);
    if (matches) for (const m of matches) brandingMentions.add(m);
  }

  return {
    bodyText,
    pageTitle,
    hasH1,
    hasTable,
    hasForm,
    crud: {
      addButtons: Array.from(new Set(addButtons)).slice(0, 10),
      editButtons,
      deleteButtons,
      addOpensDialog,
      hasInlineForm,
    },
    ux: {
      stageLabels,
      devLeaks: dedupedDevLeaks,
      nextWaveBadges: dedupedNextWave,
      emptyStateText: trimmedEmpty.length > 0 ? trimmedEmpty : null,
      emptyStateHasCta,
      hasConfirmPattern,
      hasBreadcrumb,
      brandingMentions: Array.from(brandingMentions).slice(0, 6),
    },
  };
}

async function auditOne(
  ctx: BrowserContext,
  base: string,
  url: string,
  args: Args,
): Promise<PageResult> {
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const networkErrors: PageResult["networkErrors"] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on("response", (resp) => {
    const s = resp.status();
    if (s >= 400) {
      networkErrors.push({
        url: resp.url(),
        status: s,
        type: resp.request().resourceType(),
      });
    }
  });

  const fullUrl = base.replace(/\/$/, "") + url;
  const start = Date.now();
  let status: number | null = null;
  let renderTimeMs = 0;
  let inspect: Awaited<ReturnType<typeof inspectPage>> | null = null;

  try {
    const resp = await page.goto(fullUrl, {
      waitUntil: "domcontentloaded",
      timeout: args.timeoutMs,
    });
    status = resp?.status() ?? null;
    await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
    renderTimeMs = Date.now() - start;
    inspect = await inspectPage(page);
  } catch (err) {
    renderTimeMs = Date.now() - start;
    await page.close();
    return {
      url,
      finalUrl: fullUrl,
      status,
      redirectedToLogin: false,
      renderTimeMs,
      consoleErrors,
      networkErrors,
      pageTitle: "",
      hasH1: false,
      hasTable: false,
      hasForm: false,
      bodyLen: 0,
      crud: {
        addButtons: [],
        editButtons: 0,
        deleteButtons: 0,
        addOpensDialog: null,
        hasInlineForm: false,
      },
      ux: {
        stageLabels: [],
        devLeaks: [],
        nextWaveBadges: [],
        emptyStateText: null,
        emptyStateHasCta: false,
        hasConfirmPattern: false,
        hasBreadcrumb: false,
        brandingMentions: [],
      },
      verdict: "BROKEN",
      notes: `navigation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const finalUrl = page.url();
  const finalPath = (() => {
    try {
      return new URL(finalUrl).pathname;
    } catch {
      return finalUrl;
    }
  })();
  const redirectedToLogin = /\/(login|sign-in)$/i.test(finalPath);
  const insp = inspect!;
  let errorMarker: string | undefined;
  for (const re of ERROR_MARKERS) {
    const m = insp.bodyText.match(re);
    if (m) {
      errorMarker = m[0];
      break;
    }
  }

  // Verdict.
  let verdict: PageResult["verdict"];
  let notes = "";
  if (status === null) {
    verdict = "BROKEN";
    notes = "no response";
  } else if (status >= 500) {
    verdict = "BROKEN";
    notes = `${status} server error`;
  } else if (status === 404) {
    verdict = "MISSING";
    notes = "404 not found";
  } else if (status >= 400 && status !== 401 && status !== 403) {
    verdict = "BROKEN";
    notes = `${status} client error`;
  } else if (errorMarker) {
    verdict = "BROKEN";
    notes = `error marker: ${errorMarker.slice(0, 100)}`;
  } else if (redirectedToLogin) {
    verdict = "NEEDS-AUTH";
    notes = "redirected to login";
  } else if (status === 401 || status === 403) {
    verdict = "NEEDS-AUTH";
    notes = `${status} auth required`;
  } else if (insp.ux.devLeaks.length > 0) {
    verdict = "EMPTY-LEAKY";
    notes = `developer leak: ${insp.ux.devLeaks.join(", ").slice(0, 100)}`;
  } else if (
    insp.ux.emptyStateText &&
    !insp.ux.emptyStateHasCta &&
    insp.crud.addButtons.length === 0
  ) {
    verdict = "EMPTY-OK";
    notes = `empty state without CTA: ${insp.ux.emptyStateText.slice(0, 80)}`;
  } else if (
    consoleErrors.length > 0 ||
    networkErrors.some((e) => e.status >= 500)
  ) {
    verdict = "PARTIAL";
    notes = `${consoleErrors.length} console error(s), ${networkErrors.filter((e) => e.status >= 500).length} 5xx`;
  } else {
    verdict = "USABLE";
    const summary = [
      insp.crud.addButtons.length > 0 ? `add=${insp.crud.addButtons.length}` : null,
      insp.crud.editButtons > 0 ? `edit=${insp.crud.editButtons}` : null,
      insp.crud.deleteButtons > 0 ? `del=${insp.crud.deleteButtons}` : null,
      insp.ux.stageLabels.length > 0
        ? `labels=${insp.ux.stageLabels.join("/")}`
        : null,
      insp.ux.nextWaveBadges.length > 0 ? `next-wave` : null,
    ]
      .filter(Boolean)
      .join(" ");
    notes = summary || `h1=${insp.hasH1} table=${insp.hasTable}`;
  }

  // Capture screenshot for every page (audit asks for per-menu-item shots).
  // Use webp via JPEG fallback (Playwright supports png/jpeg natively).
  let screenshot: string | undefined;
  if (!existsSync(args.screenshotDir))
    mkdirSync(args.screenshotDir, { recursive: true });
  const safeName = url.replace(/[^a-z0-9-]+/gi, "_") || "root";
  screenshot = resolve(args.screenshotDir, `${safeName}.jpeg`);
  try {
    await page.screenshot({ path: screenshot, fullPage: false, type: "jpeg", quality: 60 });
  } catch {
    screenshot = undefined;
  }

  await page.close();
  return {
    url,
    finalUrl,
    status,
    redirectedToLogin,
    renderTimeMs,
    consoleErrors,
    networkErrors,
    pageTitle: insp.pageTitle,
    hasH1: insp.hasH1,
    hasTable: insp.hasTable,
    hasForm: insp.hasForm,
    bodyLen: insp.bodyText.length,
    crud: insp.crud,
    ux: insp.ux,
    screenshot,
    verdict,
    notes,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const urls = loadUrls(args.urlsFile);
  console.log(
    `[stage-10-audit] base=${args.base} urls=${urls.length} concurrency=${args.concurrency}`,
  );

  const browser: Browser = await chromium.launch({ headless: true });
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  if (args.auth) {
    if (!args.authEmail || !args.authPassword) {
      console.error(
        "[stage-10-audit] --auth requires AUDIT_BOT_EMAIL + AUDIT_BOT_PASSWORD env",
      );
      process.exit(1);
    }
    await loginAuditBot(
      ctx,
      args.base,
      args.authEmail,
      args.authPassword,
      args.timeoutMs,
    );
  }

  // Resume-aware: if --resume and outFile exists, skip URLs already audited.
  let existingResults: PageResult[] = [];
  let queueUrls = [...urls];
  if (args.resume && existsSync(args.outFile)) {
    try {
      existingResults = JSON.parse(readFileSync(args.outFile, "utf8"));
      const seen = new Set(existingResults.map((r) => r.url));
      queueUrls = urls.filter((u) => !seen.has(u));
      console.log(
        `[stage-10-audit] resume: ${existingResults.length} done, ${queueUrls.length} remaining`,
      );
    } catch {
      console.warn("[stage-10-audit] resume failed, starting fresh");
    }
  }

  const results: PageResult[] = [...existingResults];
  let idx = existingResults.length;
  const totalUrls = urls.length;
  const queue = [...queueUrls];
  const inflight: Promise<void>[] = [];
  const startWorker = async (): Promise<void> => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      const i = ++idx;
      try {
        const r = await auditOne(ctx, args.base, url, args);
        results.push(r);
        const tag = r.verdict.padEnd(11);
        console.log(
          `[${i.toString().padStart(3, " ")}/${totalUrls}] ${tag} ${r.status ?? "—"} ${url} :: ${r.notes.slice(0, 100)}`,
        );
      } catch (err) {
        console.error(`[${i}/${totalUrls}] FATAL on ${url}:`, err);
      }
      // Periodic checkpoint every 20 pages to survive crashes.
      if (i % 20 === 0) {
        if (!existsSync(dirname(args.outFile)))
          mkdirSync(dirname(args.outFile), { recursive: true });
        writeFileSync(args.outFile, JSON.stringify(results, null, 2));
      }
    }
  };
  for (let i = 0; i < args.concurrency; i++) inflight.push(startWorker());
  await Promise.all(inflight);

  await ctx.close();
  await browser.close();

  results.sort((a, b) => a.url.localeCompare(b.url));
  if (!existsSync(dirname(args.outFile)))
    mkdirSync(dirname(args.outFile), { recursive: true });
  writeFileSync(args.outFile, JSON.stringify(results, null, 2));
  console.log(
    `[stage-10-audit] wrote ${results.length} results to ${args.outFile}`,
  );

  // Summary.
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  console.log("\n[stage-10-audit] verdict breakdown:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
  // Quick aggregates.
  const totalStageLabels = results
    .flatMap((r) => r.ux.stageLabels)
    .reduce((m, l) => m + 1, 0);
  const totalDevLeaks = results
    .flatMap((r) => r.ux.devLeaks)
    .reduce((m, l) => m + 1, 0);
  const totalNextWave = results
    .flatMap((r) => r.ux.nextWaveBadges)
    .reduce((m, l) => m + 1, 0);
  console.log(`\n[stage-10-audit] aggregate signals:`);
  console.log(`  stage label occurrences: ${totalStageLabels}`);
  console.log(`  dev-leak occurrences: ${totalDevLeaks}`);
  console.log(`  next-wave / soon badges: ${totalNextWave}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Stage 7.G — Production page audit harness.
 *
 * For each URL in `tmp/audit-urls.txt`, navigate with a headless
 * Chromium browser, capture HTTP status, console errors, network
 * errors, error markers, and DOM affordances (empty state / table /
 * form / CTA buttons). Produce a JSON report at
 * `tmp/audit-production-results.json`.
 *
 * Auth: optional. If `AUDIT_COOKIE` env is set (Playwright `cookies` JSON
 * string OR a single `name=value; ...` cookie header), it is loaded into
 * the browser context before the sweep. If unset, the sweep runs
 * unauthenticated — protected pages will redirect to /login (302/200
 * with login UI), which the script reports as `needs-auth`.
 *
 * Usage:
 *   npx tsx scripts/audit-production-pages.ts \
 *     [--base=https://management-os-fawn.vercel.app] \
 *     [--urls=tmp/audit-urls.txt] \
 *     [--out=tmp/audit-production-results.json] \
 *     [--screenshots=screenshots/] \
 *     [--concurrency=4] \
 *     [--timeout=15000]
 */

import { chromium, type Browser, type BrowserContext, type ConsoleMessage } from "playwright";
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
  cookieEnv?: string;
  auth: boolean;
  authEmail?: string;
  authPassword?: string;
}

function parseArgs(): Args {
  const flags = new Set<string>();
  const args = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const kv = a.match(/^--([^=]+)=(.*)$/);
    if (kv) {
      args.set(kv[1], kv[2]);
    } else if (a.startsWith("--")) {
      flags.add(a.slice(2));
    }
  }
  return {
    base: args.get("base") ?? "https://management-os-fawn.vercel.app",
    urlsFile: args.get("urls") ?? resolve(ROOT, "tmp/audit-urls.txt"),
    outFile: args.get("out") ?? resolve(ROOT, "tmp/audit-production-results.json"),
    screenshotDir: args.get("screenshots") ?? resolve(ROOT, "screenshots"),
    concurrency: Number(args.get("concurrency") ?? "4"),
    timeoutMs: Number(args.get("timeout") ?? "15000"),
    cookieEnv: process.env.AUDIT_COOKIE,
    auth: flags.has("auth"),
    authEmail: process.env.AUDIT_BOT_EMAIL,
    authPassword: process.env.AUDIT_BOT_PASSWORD,
  };
}

interface PageResult {
  url: string;
  finalUrl: string;
  status: number | null;
  redirectedToLogin: boolean;
  renderTimeMs: number;
  consoleErrors: string[];
  consoleWarnings: string[];
  networkErrors: { url: string; status: number; type: string }[];
  hasErrorMarker: boolean;
  errorMarkerSnippet?: string;
  pageTitle: string;
  hasH1: boolean;
  hasMain: boolean;
  hasEmptyState: boolean;
  hasEmptyStateCTA: boolean;
  hasTable: boolean;
  hasForm: boolean;
  ctaButtons: string[];
  screenshot?: string;
  verdict:
    | "USABLE"
    | "PARTIAL"
    | "BLOCKED"
    | "BROKEN"
    | "MISSING"
    | "NEEDS-AUTH"
    | "DEFERRED";
  notes: string;
}

const ERROR_MARKERS = [
  /An error occurred while rendering/i,
  /Server Components render/i,
  /Application error: a server-side exception/i,
  /500: Internal Server Error/i,
  /This page could not be found/i,
];

const DEFERRED_MARKERS = [
  /Coming soon/i,
  /deferred to Stage/i,
  /Not yet available/i,
];

/**
 * Log in as audit-bot via the production /login form. Persists session
 * cookies into the browser context for subsequent requests.
 */
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
    // Submit + wait for navigation away from /login.
    await Promise.all([
      page.waitForURL((url) => !/\/login\b/.test(new URL(url).pathname), {
        timeout: timeoutMs,
      }),
      page.click('button[type="submit"]'),
    ]);
    const finalPath = new URL(page.url()).pathname;
    if (/\/login\b/.test(finalPath)) {
      throw new Error(`login submission did not redirect; still on ${finalPath}`);
    }
    console.log(`[audit] login OK as ${email} → ${finalPath}`);
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

async function applyCookies(ctx: BrowserContext, base: string, raw: string): Promise<void> {
  // Try JSON cookie array first (Playwright shape).
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      await ctx.addCookies(arr);
      return;
    }
  } catch {
    // fall through
  }
  // Plain `name=value; name2=value2` header — split + apply to base host.
  const host = new URL(base).hostname;
  const cookies = raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((kv) => {
      const eq = kv.indexOf("=");
      const name = kv.slice(0, eq);
      const value = kv.slice(eq + 1);
      return {
        name,
        value,
        domain: host,
        path: "/",
        secure: true,
        sameSite: "Lax" as const,
      };
    });
  await ctx.addCookies(cookies);
}

async function auditOne(
  ctx: BrowserContext,
  base: string,
  url: string,
  args: Args,
): Promise<PageResult> {
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const networkErrors: PageResult["networkErrors"] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
    else if (msg.type() === "warning") consoleWarnings.push(msg.text().slice(0, 200));
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
  try {
    const resp = await page.goto(fullUrl, {
      waitUntil: "domcontentloaded",
      timeout: args.timeoutMs,
    });
    status = resp?.status() ?? null;
    // Brief settle window for client hydration / first paint, but don't
    // wait for networkidle — many pages have long-poll / SSE / cron
    // status pings that never settle.
    await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  } catch (err) {
    // navigation timeout / failure
    const renderTimeMs = Date.now() - start;
    await page.close();
    return {
      url,
      finalUrl: fullUrl,
      status,
      redirectedToLogin: false,
      renderTimeMs,
      consoleErrors,
      consoleWarnings,
      networkErrors,
      hasErrorMarker: false,
      pageTitle: "",
      hasH1: false,
      hasMain: false,
      hasEmptyState: false,
      hasEmptyStateCTA: false,
      hasTable: false,
      hasForm: false,
      ctaButtons: [],
      verdict: "BROKEN",
      notes: `navigation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const renderTimeMs = Date.now() - start;

  // Capture page state.
  const finalUrl = page.url();
  // Match `/login` or `/sign-in` at end of path or before `?` only —
  // do NOT match `/login-attempts` (substring word-boundary trap).
  const finalPath = (() => {
    try {
      return new URL(finalUrl).pathname;
    } catch {
      return finalUrl;
    }
  })();
  const redirectedToLogin = /\/(login|sign-in)$/i.test(finalPath);
  const pageTitle = await page.title().catch(() => "");
  const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  const hasH1 = (await page.locator("h1").count()) > 0;
  const hasMain = (await page.locator("main").count()) > 0;
  const hasTable = (await page.locator("table").count()) > 0;
  const hasForm = (await page.locator("form").count()) > 0;
  const emptyStateMatch = /No\s+\w+\s+(yet|found|to display)|Empty|deferred/i.test(bodyText);
  const ctaButtonTexts = await page
    .locator("button, a")
    .evaluateAll((els) =>
      els
        .map((e) => (e.textContent ?? "").trim())
        .filter((t) => /^(\+ |Add|Create|Connect|New|Generate|Start|Sign up|Get started)/i.test(t))
        .slice(0, 8),
    )
    .catch(() => [] as string[]);
  const hasEmptyStateCTA = emptyStateMatch && ctaButtonTexts.length > 0;
  let errorMarker: string | undefined;
  for (const re of ERROR_MARKERS) {
    const m = bodyText.match(re);
    if (m) {
      errorMarker = m[0].slice(0, 200);
      break;
    }
  }
  let isDeferred = false;
  for (const re of DEFERRED_MARKERS) {
    if (re.test(bodyText)) {
      isDeferred = true;
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
    notes = `error marker: ${errorMarker}`;
  } else if (redirectedToLogin) {
    verdict = "NEEDS-AUTH";
    notes = "redirected to login";
  } else if (status === 401 || status === 403) {
    verdict = "NEEDS-AUTH";
    notes = `${status} auth required`;
  } else if (isDeferred) {
    verdict = "DEFERRED";
    notes = "page declares deferred/coming-soon";
  } else if (consoleErrors.length > 0 || networkErrors.some((e) => e.status >= 500)) {
    verdict = "PARTIAL";
    notes = `${consoleErrors.length} console error(s), ${networkErrors.length} network error(s)`;
  } else {
    verdict = "USABLE";
    notes = `${pageTitle.slice(0, 80)} | h1=${hasH1} table=${hasTable} form=${hasForm} cta=${ctaButtonTexts.length}`;
  }

  // Screenshot only for non-USABLE/non-NEEDS-AUTH outcomes.
  let screenshot: string | undefined;
  if (verdict === "BROKEN" || verdict === "PARTIAL" || verdict === "MISSING") {
    if (!existsSync(args.screenshotDir))
      mkdirSync(args.screenshotDir, { recursive: true });
    const safeName = url.replace(/[^a-z0-9-]+/gi, "_") || "root";
    screenshot = resolve(args.screenshotDir, `${safeName}.png`);
    try {
      await page.screenshot({ path: screenshot, fullPage: false });
    } catch {
      screenshot = undefined;
    }
  }

  await page.close();
  return {
    url,
    finalUrl,
    status,
    redirectedToLogin,
    renderTimeMs,
    consoleErrors,
    consoleWarnings,
    networkErrors,
    hasErrorMarker: !!errorMarker,
    errorMarkerSnippet: errorMarker,
    pageTitle,
    hasH1,
    hasMain,
    hasEmptyState: emptyStateMatch,
    hasEmptyStateCTA,
    hasTable,
    hasForm,
    ctaButtons: ctaButtonTexts,
    screenshot,
    verdict,
    notes,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const urls = loadUrls(args.urlsFile);
  console.log(`[audit] base=${args.base} urls=${urls.length} concurrency=${args.concurrency}`);

  const browser: Browser = await chromium.launch({ headless: true });
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  if (args.cookieEnv) {
    console.log("[audit] applying AUDIT_COOKIE");
    await applyCookies(ctx, args.base, args.cookieEnv);
  }
  if (args.auth) {
    if (!args.authEmail || !args.authPassword) {
      console.error(
        "[audit] --auth requires AUDIT_BOT_EMAIL + AUDIT_BOT_PASSWORD env (load .env.audit.local)",
      );
      process.exit(1);
    }
    await loginAuditBot(ctx, args.base, args.authEmail, args.authPassword, args.timeoutMs);
  }

  const results: PageResult[] = [];
  let idx = 0;
  const queue = [...urls];
  const inflight: Promise<void>[] = [];
  const startWorker = async (): Promise<void> => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      const i = ++idx;
      const r = await auditOne(ctx, args.base, url, args);
      results.push(r);
      const tag = r.verdict.padEnd(10);
      console.log(
        `[${i.toString().padStart(3, " ")}/${urls.length}] ${tag} ${r.status ?? "—"} ${url} :: ${r.notes.slice(0, 100)}`,
      );
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
  console.log(`[audit] wrote ${results.length} results to ${args.outFile}`);

  // Summary.
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  console.log("\n[audit] verdict breakdown:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Stage 10.6 / Phase 10.6.B.4.3 — Modal-First migration PR 3.
 *
 * villa-guides/wifi migration. Demonstrates the helper works for forms
 * that use the non-redirect success pattern (action returns
 * `{ok: true, wifiId}`, form does router.push() in useEffect) — adapted
 * to call onSuccess instead of router.push when in modal mode.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const WIFI_FORM = "src/components/villa-guides/wifi-form.tsx";
const WIFI_ADD_BUTTON = "src/components/villa-guides/wifi-add-button.tsx";
const WIFI_PAGE = "src/app/(dashboard)/dashboard/villa-guides/wifi/page.tsx";

test("10.6.B.4.3 — WifiForm accepts onSuccess + onCancel", () => {
  const src = read(WIFI_FORM);
  assert.match(src, /onSuccess\?: \(\) => void;/);
  assert.match(src, /onCancel\?: \(\) => void;/);
});

test("10.6.B.4.3 — WifiForm success effect prefers onSuccess over router.push", () => {
  const src = read(WIFI_FORM);
  assert.match(
    src,
    /if \(onSuccess\) onSuccess\(\);\s*else router\.push/,
  );
});

test("10.6.B.4.3 — WifiForm Cancel button prefers onCancel over router.back", () => {
  const src = read(WIFI_FORM);
  assert.match(
    src,
    /onClick=\{\(\) => \(onCancel \? onCancel\(\) : router\.back\(\)\)\}/,
  );
});

test("10.6.B.4.3 — WifiAddButton wrapper ships + uses ModalFirstAddButton", () => {
  assert.ok(existsSync(resolve(ROOT, WIFI_ADD_BUTTON)));
  const src = read(WIFI_ADD_BUTTON);
  assert.match(
    src,
    /import \{ ModalFirstAddButton \} from "@\/components\/ui\/primitives\/modal-first-add-button";/,
  );
});

test("10.6.B.4.3 — /dashboard/villa-guides/wifi list page renders WifiAddButton, NOT Link to /new", () => {
  const src = read(WIFI_PAGE);
  assert.match(src, /<WifiAddButton/);
  assert.doesNotMatch(
    src,
    /<Link[\s\S]{0,200}href="\/dashboard\/villa-guides\/wifi\/new"[\s\S]{0,80}\+ Add Wi-Fi/,
    "wifi list page still has Link-to-/new Add CTA",
  );
});

test("10.6.B.4.3 — /dashboard/villa-guides/wifi/new route stays for deep-link survival", () => {
  assert.ok(
    existsSync(
      resolve(ROOT, "src/app/(dashboard)/dashboard/villa-guides/wifi/new/page.tsx"),
    ),
  );
});

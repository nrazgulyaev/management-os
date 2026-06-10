import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { AUTH_DIR, PERSONAS } from "./cabinet-personas";

/**
 * Auth setup project for the cabinet visual suite.
 *
 * Signs each persona in through the real /login form (same selectors
 * the multi-tenant e2e suite uses — input[name=email] /
 * input[name=password] / button[type=submit]) and saves the Supabase
 * session as a Playwright storage state under tests/visual/.auth/
 * (gitignored — never commit session cookies).
 *
 * The cabinet-desktop / cabinet-mobile projects declare this project
 * as a dependency, so the states exist before any screenshot test
 * loads. Personas without credentials in the environment skip here,
 * and their screens skip in cabinets.spec.ts with the same message —
 * no session is ever faked.
 */

setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

for (const persona of Object.values(PERSONAS)) {
  setup(`authenticate: ${persona.key} (${persona.description})`, async ({ page }) => {
    setup.skip(
      !persona.ready,
      `Set ${persona.emailVar} + ${persona.passwordVar} to enable the ${persona.key} cabinet screenshots. See tests/visual/README.md.`,
    );

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(persona.email);
    await page.locator('input[name="password"]').fill(persona.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
      timeout: 15_000,
    });

    await page.context().storageState({ path: persona.stateFile });
  });
}

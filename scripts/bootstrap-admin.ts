/**
 * Link a Supabase Auth user to a super_admin app_users row from the CLI.
 * Useful when the visual /setup/admin-bootstrap flow is not practical
 * (e.g. CI provisioning, recovery, or operator on-call).
 *
 *   AUTH_USER_ID=<uuid> EMAIL=<email> FULL_NAME="Name" \
 *     npx tsx scripts/bootstrap-admin.ts
 *
 *   # If a super_admin already exists, also pass:
 *   ADMIN_BOOTSTRAP_SECRET=<secret>
 */
// Run with: node --env-file=.env.local --import tsx scripts/bootstrap-admin.ts
// Or via npm: npm run admin:bootstrap (script wires --env-file).
import { linkSupabaseUserToSuperAdmin } from "../src/features/auth/bootstrap";

async function main() {
  const authUserId = process.env.AUTH_USER_ID;
  const email = process.env.EMAIL;
  const fullName = process.env.FULL_NAME ?? email ?? "Super Admin";
  const secret = process.env.ADMIN_BOOTSTRAP_SECRET ?? null;

  if (!authUserId || !email) {
    console.error(
      "Usage: AUTH_USER_ID=<uuid> EMAIL=<email> [FULL_NAME=...] [ADMIN_BOOTSTRAP_SECRET=...] npx tsx scripts/bootstrap-admin.ts",
    );
    process.exit(1);
  }

  const result = await linkSupabaseUserToSuperAdmin({
    authUserId,
    email,
    fullName,
    providedSecret: secret,
    ipAddress: null,
    userAgent: "scripts/bootstrap-admin.ts",
  });

  if (!result.ok) {
    console.error(`✗ Bootstrap failed: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    `✓ Linked ${email} as super_admin · app_user ${result.appUserId}` +
      (result.firstAdmin ? " (first admin)" : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

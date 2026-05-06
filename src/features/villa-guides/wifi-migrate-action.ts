"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  migratePlaintextWifiPasswords,
  type MigrationResult,
} from "./wifi-crypto";

export type MigrationActionResult =
  | { ok: true; result: MigrationResult }
  | { ok: false; error: string };

export async function runWifiMigrationAction(): Promise<MigrationActionResult> {
  await requirePermission("wifi_credentials.encrypt");
  const me = await getCurrentAppUser();
  try {
    const result = await migratePlaintextWifiPasswords({
      actorAppUserId: me?.id ?? null,
    });
    revalidatePath("/dashboard/villa-guides/wifi");
    revalidatePath("/dashboard/villa-guides/wifi/migrate");
    return { ok: true, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Migration failed.";
    return { ok: false, error };
  }
}

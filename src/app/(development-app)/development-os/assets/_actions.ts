"use server";

/**
 * Wire-up — "use server" adapters for the server-only asset CRUD actions
 * (asset-actions.ts). Each normalizes to {ok} | {ok:false,error} and
 * revalidates the assets list.
 *
 * The underlying actions already enforce requireInternalUser +
 * requireOrgId (the org-owning project / asset is re-checked inside each
 * action). These wrappers add NO authority — they only adapt the call
 * shape for the client modal and never forward a client-supplied
 * organizationId.
 */

import { revalidatePath } from "next/cache";
import {
  createAsset,
  updateAssetAttributes,
  changeAssetType,
} from "@/lib/development/server/assets/asset-actions";

const LIST_PATH = "/development-os/assets";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

/** Parse the freeform "key: value" attribute textarea into a JSONB record. */
function parseAttributes(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    // Coerce obvious numbers / booleans; otherwise keep the string.
    if (value === "true" || value === "false") out[key] = value === "true";
    else if (value !== "" && Number.isFinite(Number(value)))
      out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

export interface CreateAssetFormInput {
  projectId: string;
  assetTypeKey: string;
  unitCode: string;
  slug: string;
  name?: string | null;
  status: string;
  attributesText?: string;
  bedrooms?: number;
  builtAreaSqm?: number;
}

export async function createAssetAction(
  input: CreateAssetFormInput,
): Promise<ActionResult> {
  try {
    await createAsset({
      projectId: input.projectId,
      assetTypeKey: input.assetTypeKey,
      unitCode: input.unitCode,
      slug: input.slug,
      name: input.name || null,
      status: input.status as never,
      assetAttributes: parseAttributes(input.attributesText ?? ""),
      ...(input.bedrooms !== undefined ? { bedrooms: input.bedrooms } : {}),
      ...(input.builtAreaSqm !== undefined
        ? { builtAreaSqm: input.builtAreaSqm }
        : {}),
    });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to create asset.");
  }
}

export interface UpdateAssetAttributesFormInput {
  assetId: string;
  attributesText: string;
}

export async function updateAssetAttributesAction(
  input: UpdateAssetAttributesFormInput,
): Promise<ActionResult> {
  try {
    await updateAssetAttributes({
      assetId: input.assetId,
      assetAttributes: parseAttributes(input.attributesText),
    });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to update asset attributes.");
  }
}

export interface ChangeAssetTypeFormInput {
  assetId: string;
  newAssetTypeKey: string;
  reason: string;
}

export async function changeAssetTypeAction(
  input: ChangeAssetTypeFormInput,
): Promise<ActionResult> {
  try {
    await changeAssetType({
      assetId: input.assetId,
      newAssetTypeKey: input.newAssetTypeKey,
      reason: input.reason,
    });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, "Failed to change asset type.");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getDocDetail } from "@/features/documents/app-services";

/**
 * Documents-app v1 — preview-pane detail.
 *
 * GET /api/documents/[id]/detail
 *   → { versions: [...], signatures: [...] }
 *
 * Auth: requires sign-in. Used by the client preview pane to lazily
 * load version history + signature requests for the selected document.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  const detail = await getDocDetail(parsed.data);
  return NextResponse.json(detail);
}

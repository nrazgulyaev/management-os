import { NextResponse, type NextRequest } from "next/server";
import {
  getGuestMessagePreviewByHoldToken,
  getGuestStatusSnapshotByHoldToken,
  listGuestNotificationsByHoldToken,
  rebuildGuestStatusSnapshotForHold,
  resolveGuestChainByToken,
} from "@/features/direct-booking/guest-status-services";
import {
  buildGuestTimeline,
  type PublicGuestStage,
} from "@/features/direct-booking/guest-status-pure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const chain = await resolveGuestChainByToken(token);
  if (!chain) {
    return NextResponse.json(
      { ok: false, reason: "not_found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  // Best-effort rebuild on read so the snapshot is always fresh for the
  // public status page; failures don't block the response.
  try {
    await rebuildGuestStatusSnapshotForHold(chain.hold.id, token);
  } catch (err) {
    console.error("[guest-status] rebuild on read failed", err);
  }
  const [snapshot, notifications, messagePreview] = await Promise.all([
    getGuestStatusSnapshotByHoldToken(token),
    listGuestNotificationsByHoldToken(token),
    getGuestMessagePreviewByHoldToken(token),
  ]);
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, reason: "snapshot_unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  const stage = snapshot.publicStage as PublicGuestStage;
  const timeline = buildGuestTimeline(
    stage,
    notifications.map((n) => ({
      notificationKey: n.notificationKey,
      createdAt:
        n.createdAt instanceof Date
          ? n.createdAt.toISOString()
          : (n.createdAt as unknown as string),
    })),
  );
  return NextResponse.json(
    {
      snapshot: {
        publicStage: snapshot.publicStage,
        headline: snapshot.headline,
        body: snapshot.body,
        nextActionLabel: snapshot.nextActionLabel,
        nextActionHref: snapshot.nextActionHref,
        guestCanAct: snapshot.guestCanAct,
        holdExpiresAt:
          snapshot.holdExpiresAt instanceof Date
            ? snapshot.holdExpiresAt.toISOString()
            : null,
        depositExpiresAt:
          snapshot.depositExpiresAt instanceof Date
            ? snapshot.depositExpiresAt.toISOString()
            : null,
        totalAmountMinor: snapshot.totalAmountMinor?.toString() ?? null,
        depositAmountMinor: snapshot.depositAmountMinor?.toString() ?? null,
        balanceDueMinor: snapshot.balanceDueMinor?.toString() ?? null,
        currency: snapshot.currency,
        villaLabel: snapshot.villaLabel,
        checkIn: snapshot.checkIn as unknown as string | null,
        checkOut: snapshot.checkOut as unknown as string | null,
        nights: snapshot.nights,
        guestCount: snapshot.guestCount,
      },
      notifications: notifications
        .filter((n) => n.status !== "archived")
        .map((n) => ({
          id: n.id,
          notificationKey: n.notificationKey,
          publicTitle: n.publicTitle,
          publicBody: n.publicBody,
          publicActionLabel: n.publicActionLabel,
          publicActionHref: n.publicActionHref,
          severity: n.severity,
          status: n.status,
          createdAt:
            n.createdAt instanceof Date
              ? n.createdAt.toISOString()
              : (n.createdAt as unknown as string),
        })),
      messagePreview,
      timeline,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function POST() {
  return methodNotAllowed();
}
export async function PUT() {
  return methodNotAllowed();
}
export async function PATCH() {
  return methodNotAllowed();
}
export async function DELETE() {
  return methodNotAllowed();
}

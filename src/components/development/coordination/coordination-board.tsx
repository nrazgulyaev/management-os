"use client";

/**
 * Coordination cabinet — split "drawing + registry" board.
 *
 * Left: the active drawing revision with placed pins. Clicking the plan in
 * "place" mode drops a pin at the clicked (x,y%) and opens the new-item dialog
 * (RFI / Submittal) or links the selected registry item to that position.
 * Right: the unified registry (RFI / Submittal / Defect) — clicking a row
 * opens the item drawer with the reply thread + approve/close.
 *
 * Reuses @/components/ui primitives + the cream/stone/ink tokens. All writes
 * go through the permission-gated server actions in coordination-actions.ts.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus, X, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  COORDINATION_KINDS,
  KIND_LABEL,
  KIND_COLOR,
  type CoordinationItemKind,
  type CoordinationItemSummary,
} from "@/features/development/coordination/coordination-model";
import { RFI_DISCIPLINES } from "@/features/development/rfi/rfi-routing";
import { SUBMITTAL_TYPES } from "@/lib/db/schema/submittals";
import {
  placeCoordinationPin,
  removeCoordinationPin,
  createSubmittal,
  createCoordinationRfi,
} from "@/lib/development/server/coordination/coordination-actions";
import { CoordinationItemDrawer } from "./coordination-item-drawer";
import { CoordinationMarkup } from "./coordination-markup";

export interface CoordinationBoardProps {
  projectId: string;
  projectCode: string;
  revisionId: string;
  imageUrl: string | null;
  imageAlt: string;
  imageMissingNote: string | null;
  items: {
    rfis: CoordinationItemSummary[];
    submittals: CoordinationItemSummary[];
    defects: CoordinationItemSummary[];
  };
}

type PendingPin = { xPct: number; yPct: number };

export function CoordinationBoard({
  projectId,
  projectCode,
  revisionId,
  imageUrl,
  imageAlt,
  imageMissingNote,
  items,
}: CoordinationBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [placeMode, setPlaceMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PendingPin | null>(null);
  const [kindFilter, setKindFilter] = useState<CoordinationItemKind | "all">("all");
  // "pins" = item pins canvas; "markup" = persistent drawing annotations.
  const [paneMode, setPaneMode] = useState<"pins" | "markup">("pins");

  // Open item drawer.
  const [openItem, setOpenItem] = useState<CoordinationItemSummary | null>(null);

  const allItems = useMemo(
    () => [...items.rfis, ...items.submittals, ...items.defects],
    [items],
  );
  const pinnedItems = useMemo(
    () => allItems.filter((i) => i.pinId && i.xPct != null && i.yPct != null),
    [allItems],
  );
  const visibleItems = useMemo(
    () =>
      kindFilter === "all"
        ? allItems
        : allItems.filter((i) => i.kind === kindFilter),
    [allItems, kindFilter],
  );

  function onPlanClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placeMode || !imageUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPin({
      xPct: Math.max(0, Math.min(100, xPct)),
      yPct: Math.max(0, Math.min(100, yPct)),
    });
  }

  function linkExisting(item: CoordinationItemSummary) {
    if (!pendingPin) return;
    setError(null);
    startTransition(async () => {
      try {
        await placeCoordinationPin({
          revisionId,
          itemKind: item.kind,
          itemId: item.id,
          xPct: pendingPin.xPct,
          yPct: pendingPin.yPct,
        });
        setPendingPin(null);
        setPlaceMode(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to place pin");
      }
    });
  }

  function removePin(pinId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeCoordinationPin({ pinId });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove pin");
      }
    });
  }

  const unpinnedItems = useMemo(
    () => allItems.filter((i) => !i.pinId),
    [allItems],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
      {/* ── Drawing pane ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={paneMode === "pins" ? "primary" : "secondary"}
            onClick={() => setPaneMode("pins")}
          >
            <MapPin className="w-4 h-4" strokeWidth={1.75} />
            Pins
          </Button>
          <Button
            variant={paneMode === "markup" ? "primary" : "secondary"}
            onClick={() => {
              setPaneMode("markup");
              setPlaceMode(false);
              setPendingPin(null);
            }}
            disabled={!imageUrl}
          >
            <PencilRuler className="w-4 h-4" strokeWidth={1.75} />
            Markup
          </Button>
          {paneMode === "pins" && (
            <>
              <span className="mx-1 h-5 w-px bg-line-soft" />
              <Button
                variant={placeMode ? "primary" : "secondary"}
                onClick={() => {
                  setPlaceMode((v) => !v);
                  setPendingPin(null);
                }}
                disabled={!imageUrl}
              >
                <MapPin className="w-4 h-4" strokeWidth={1.75} />
                {placeMode ? "Placing — click the plan" : "Place pin on plan"}
              </Button>
              <span className="text-xs text-ink-tertiary">
                {pinnedItems.length} pinned · {unpinnedItems.length} unpinned
              </span>
            </>
          )}
        </div>

        {paneMode === "markup" && imageUrl ? (
          <CoordinationMarkup
            revisionId={revisionId}
            imageUrl={imageUrl}
            imageAlt={imageAlt}
          />
        ) : (
        <div
          onClick={onPlanClick}
          className={cn(
            "relative inline-block rounded-md overflow-hidden border border-line-soft bg-muted select-none",
            placeMode && imageUrl && "cursor-crosshair ring-2 ring-accent",
          )}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt}
              draggable={false}
              className="block max-w-full h-auto"
            />
          ) : (
            <div className="p-10">
              <EmptyState
                title="No drawing preview"
                description={
                  imageMissingNote ??
                  "This revision has no displayable image yet. Pins still work once a raster revision is uploaded."
                }
              />
            </div>
          )}

          {/* Placed pins */}
          {imageUrl &&
            pinnedItems.map((item) => (
              <PinMarker
                key={item.pinId}
                item={item}
                onOpen={() => setOpenItem(item)}
                onRemove={() => item.pinId && removePin(item.pinId)}
              />
            ))}

          {/* Pending (not yet linked) pin */}
          {imageUrl && pendingPin && (
            <div
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${pendingPin.xPct}%`, top: `${pendingPin.yPct}%` }}
            >
              <MapPin
                className="w-6 h-6 text-accent drop-shadow"
                strokeWidth={2}
                fill="currentColor"
              />
            </div>
          )}
        </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      {/* ── Registry pane ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary mr-1">
            Show
          </span>
          <button type="button" onClick={() => setKindFilter("all")}>
            <Badge tone={kindFilter === "all" ? "accent" : "outline"}>All</Badge>
          </button>
          {COORDINATION_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => setKindFilter(k)}>
              <Badge tone={kindFilter === k ? "accent" : "outline"}>
                {KIND_LABEL[k]}
              </Badge>
            </button>
          ))}
        </div>

        {visibleItems.length === 0 ? (
          <EmptyState
            title="No items yet"
            description="Create an RFI or Submittal from the toolbar, or open the QA/QC cabinet to log a defect — then pin it to this drawing."
          />
        ) : (
          <ul className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
            {visibleItems.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (placeMode && pendingPin && !item.pinId) {
                      linkExisting(item);
                    } else {
                      setOpenItem(item);
                    }
                  }}
                  className="w-full text-left rounded-lg border border-line-soft bg-surface hover:bg-muted transition-colors px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: KIND_COLOR[item.kind] }}
                    />
                    <span className="font-mono text-[11px] text-ink-tertiary">
                      {item.ref}
                    </span>
                    <Badge tone={item.statusTone}>{item.status}</Badge>
                    {item.pinId ? (
                      <Badge tone="neutral">pinned</Badge>
                    ) : placeMode && pendingPin ? (
                      <span className="ml-auto text-[10px] text-accent">
                        click to pin here
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-ink line-clamp-2">
                    {item.title}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* New-item launcher (RFI / Submittal) */}
      <NewItemFooter
        projectId={projectId}
        projectCode={projectCode}
        pending={pending}
      />

      {/* Item drawer */}
      {openItem && (
        <CoordinationItemDrawer
          item={openItem}
          onClose={() => setOpenItem(null)}
        />
      )}
    </div>
  );
}

function PinMarker({
  item,
  onOpen,
  onRemove,
}: {
  item: CoordinationItemSummary;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-full group"
      style={{ left: `${item.xPct}%`, top: `${item.yPct}%` }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        title={`${item.ref} — ${item.title}`}
      >
        <MapPin
          className="w-6 h-6 drop-shadow"
          strokeWidth={2}
          fill={KIND_COLOR[item.kind]}
          color={KIND_COLOR[item.kind]}
        />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove pin"
        className="absolute -top-1 -right-2 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-danger text-white"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </div>
  );
}

/** RFI + Submittal create dialogs, mounted from a single footer bar. */
function NewItemFooter({
  projectId,
  projectCode,
  pending,
}: {
  projectId: string;
  projectCode: string;
  pending: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"rfi" | "submittal" | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // RFI fields
  const [question, setQuestion] = useState("");
  const [rfiDiscipline, setRfiDiscipline] = useState<string>("architectural");

  // Submittal fields
  const [title, setTitle] = useState("");
  const [submittalType, setSubmittalType] = useState<string>("shop_drawing");
  const [subDiscipline, setSubDiscipline] = useState<string>("architectural");

  function reset() {
    setMode(null);
    setError(null);
    setQuestion("");
    setTitle("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        if (mode === "rfi") {
          if (question.trim().length < 3) {
            setError("Write the question first.");
            return;
          }
          await createCoordinationRfi({
            projectId,
            projectCode,
            question: question.trim(),
            discipline: rfiDiscipline,
          });
        } else if (mode === "submittal") {
          if (title.trim().length < 3) {
            setError("Give the submittal a title.");
            return;
          }
          await createSubmittal({
            projectId,
            projectCode,
            title: title.trim(),
            submittalType,
            discipline: subDiscipline,
          });
        }
        reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create item");
      }
    });
  }

  return (
    <div className="lg:col-span-2 flex items-center gap-2 border-t border-line-soft pt-3">
      <span className="text-xs text-ink-tertiary mr-1">New:</span>
      <Button variant="secondary" onClick={() => setMode("rfi")} disabled={pending}>
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        RFI
      </Button>
      <Button
        variant="secondary"
        onClick={() => setMode("submittal")}
        disabled={pending}
      >
        <Plus className="w-4 h-4" strokeWidth={1.75} />
        Submittal
      </Button>

      <Modal
        open={mode !== null}
        onOpenChange={(o) => !o && reset()}
        size="md"
        ariaLabel="Create coordination item"
      >
        <ModalHeader
          title={mode === "rfi" ? "New RFI" : "New submittal"}
          description={
            mode === "rfi"
              ? "Opens an RFI on this project. Pin it to the drawing afterwards."
              : "Logs a submittal in the register. Pin it to the drawing afterwards."
          }
          onClose={reset}
        />
        <ModalBody>
          {mode === "rfi" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-ink-secondary">Question</span>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  placeholder="What needs clarification from the design team?"
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-secondary">Discipline</span>
                <select
                  value={rfiDiscipline}
                  onChange={(e) => setRfiDiscipline(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm bg-surface"
                >
                  {RFI_DISCIPLINES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-ink-secondary">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
                  placeholder="e.g. Window schedule — Block A shop drawings"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-ink-secondary">Type</span>
                  <select
                    value={submittalType}
                    onChange={(e) => setSubmittalType(e.target.value)}
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm bg-surface"
                  >
                    {SUBMITTAL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-ink-secondary">Discipline</span>
                  <select
                    value={subDiscipline}
                    onChange={(e) => setSubDiscipline(e.target.value)}
                    className="mt-1 block w-full rounded border border-line-soft p-2 text-sm bg-surface"
                  >
                    {RFI_DISCIPLINES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={reset} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

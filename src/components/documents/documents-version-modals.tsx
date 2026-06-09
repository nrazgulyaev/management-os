"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { addDocumentVersionAction } from "@/features/documents/app-actions";

interface VersionRow {
  id: string;
  versionNo: number;
  title: string;
  fileName: string | null;
  contentHash: string | null;
  changeNote: string | null;
  isCurrent: boolean;
  createdAt: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function VersionCompareButton({
  documentId,
  versions,
}: {
  documentId: string;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<null | "add" | "compare">(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Add-version state
  const [title, setTitle] = React.useState("");
  const [changeNote, setChangeNote] = React.useState("");

  // Compare state
  const [leftId, setLeftId] = React.useState<string>(versions[1]?.id ?? "");
  const [rightId, setRightId] = React.useState<string>(versions[0]?.id ?? "");

  const left = versions.find((v) => v.id === leftId) ?? null;
  const right = versions.find((v) => v.id === rightId) ?? null;

  function submitAdd() {
    setError(null);
    startTransition(async () => {
      const r = await addDocumentVersionAction({
        documentId,
        title: title.trim(),
        changeNote,
      });
      if (!r.ok) setError(r.error);
      else {
        setMode(null);
        setTitle("");
        setChangeNote("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => setMode("add")}
        >
          Add version
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={versions.length < 2}
          title={versions.length < 2 ? "Need at least two versions to compare" : undefined}
          onClick={() => setMode("compare")}
        >
          Compare
        </Button>
      </div>

      {/* Add version */}
      <Modal
        open={mode === "add"}
        onOpenChange={(o) => !o && setMode(null)}
        size="sm"
        ariaLabel="Add document version"
      >
        <ModalHeader
          title="Add a new version"
          description="Snapshots the current file pointer and records what changed."
          onClose={() => setMode(null)}
        />
        <ModalBody className="flex flex-col gap-3">
          <Field label="Version title" htmlFor="ver-title">
            <Input
              id="ver-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Revised terms — clause 4"
            />
          </Field>
          <Field label="What changed" htmlFor="ver-note">
            <Textarea
              id="ver-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              rows={3}
              placeholder="Updated payment schedule and added indemnity clause."
            />
          </Field>
          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setMode(null)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submitAdd} disabled={pending || title.trim().length < 2}>
            {pending ? "Saving…" : "Save version"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Compare */}
      <Modal
        open={mode === "compare"}
        onOpenChange={(o) => !o && setMode(null)}
        size="lg"
        ariaLabel="Compare document versions"
      >
        <ModalHeader title="Compare versions" onClose={() => setMode(null)} />
        <ModalBody className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base version" htmlFor="cmp-left">
              <Select id="cmp-left" value={leftId} onChange={(e) => setLeftId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNo} — {fmt(v.createdAt)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Compare to" htmlFor="cmp-right">
              <Select id="cmp-right" value={rightId} onChange={(e) => setRightId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNo} — {fmt(v.createdAt)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VersionCard label="Base" v={left} />
            <VersionCard label="Compare" v={right} />
          </div>
          <p className="text-[11px] text-ink-tertiary">
            v1 compares metadata, change notes, and content hashes. Side-by-side
            rendered-text diff lands with file storage.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setMode(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function VersionCard({ label, v }: { label: string; v: VersionRow | null }) {
  if (!v) {
    return (
      <div className="rounded-md border border-line-soft p-3 text-xs text-ink-tertiary">
        No version selected.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line-soft p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-label">{label}</span>
        <Badge tone={v.isCurrent ? "success" : "outline"}>v{v.versionNo}</Badge>
      </div>
      <dl className="text-xs flex flex-col gap-1">
        <Row k="Title" val={v.title} />
        <Row k="File" val={v.fileName ?? "—"} />
        <Row k="Hash" val={v.contentHash ? v.contentHash.slice(0, 16) + "…" : "—"} mono />
        <Row k="Created" val={fmt(v.createdAt)} />
      </dl>
      <p className="text-xs text-ink-secondary border-t border-line-soft pt-2">
        {v.changeNote ?? "No change note."}
      </p>
    </div>
  );
}

function Row({ k, val, mono }: { k: string; val: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-tertiary">{k}</dt>
      <dd className={mono ? "font-mono text-ink-secondary truncate" : "text-ink-secondary truncate"}>
        {val}
      </dd>
    </div>
  );
}

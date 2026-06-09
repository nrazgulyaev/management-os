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
import { EmptyState } from "@/components/ui/empty-state";
import {
  generateFromTemplateAction,
  createTemplateAction,
} from "@/features/documents/app-actions";
import type { TemplateRow } from "@/features/documents/app-services";

const ENTITY_TYPES = [
  "project",
  "villa",
  "owner",
  "booking",
  "supplier",
  "task",
  "maintenance",
] as const;

const DOC_TYPES = [
  "contract",
  "invoice",
  "receipt",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "other",
] as const;

const VISIBILITIES = ["internal", "owner", "guest", "public"] as const;

export function GenerateFromTemplateButton({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"pick" | "generate" | "create">("pick");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const active = templates.filter((t) => t.isActive);
  const [selectedTpl, setSelectedTpl] = React.useState<TemplateRow | null>(null);

  // Generate state
  const [title, setTitle] = React.useState("");
  const [entityType, setEntityType] =
    React.useState<(typeof ENTITY_TYPES)[number]>("owner");
  const [entityId, setEntityId] = React.useState("");

  // Create-template state
  const [tName, setTName] = React.useState("");
  const [tType, setTType] = React.useState<(typeof DOC_TYPES)[number]>("contract");
  const [tDesc, setTDesc] = React.useState("");
  const [tBody, setTBody] = React.useState("");
  const [tVis, setTVis] = React.useState<(typeof VISIBILITIES)[number]>("internal");

  function reset() {
    setView("pick");
    setSelectedTpl(null);
    setError(null);
    setTitle("");
    setEntityId("");
  }

  function submitGenerate() {
    if (!selectedTpl) return;
    setError(null);
    startTransition(async () => {
      const r = await generateFromTemplateAction({
        templateId: selectedTpl.id,
        title: title.trim(),
        entityType,
        entityId: entityId.trim(),
      });
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        reset();
        router.refresh();
      }
    });
  }

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const r = await createTemplateAction({
        name: tName.trim(),
        documentType: tType,
        description: tDesc,
        body: tBody,
        defaultVisibility: tVis,
      });
      if (!r.ok) setError(r.error);
      else {
        setTName("");
        setTDesc("");
        setTBody("");
        setView("pick");
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Generate from template
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
        size="lg"
        ariaLabel="Generate from template"
      >
        {view === "pick" && (
          <>
            <ModalHeader
              title="Templates"
              description="Pick a template to generate a document, or create a new template."
              onClose={() => setOpen(false)}
            />
            <ModalBody className="flex flex-col gap-3">
              {active.length === 0 ? (
                <EmptyState
                  variant="first-run"
                  title="No templates yet"
                  body="Create your first reusable document template."
                  inline
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {active.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTpl(t);
                          setTitle(t.name);
                          setView("generate");
                        }}
                        className="w-full text-left rounded-md border border-line-soft px-3 py-2.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{t.name}</span>
                          <Badge tone="outline">{t.documentType}</Badge>
                        </div>
                        {t.description && (
                          <p className="text-xs text-ink-tertiary mt-0.5">{t.description}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" size="sm" onClick={() => setView("create")}>
                New template
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}

        {view === "generate" && selectedTpl && (
          <>
            <ModalHeader
              title={`Generate: ${selectedTpl.name}`}
              description="Creates a new document (v1) linked to the chosen entity."
              onClose={() => setOpen(false)}
            />
            <ModalBody className="flex flex-col gap-3">
              <Field label="Document title" htmlFor="gen-title">
                <Input
                  id="gen-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entity type" htmlFor="gen-etype">
                  <Select
                    id="gen-etype"
                    value={entityType}
                    onChange={(e) =>
                      setEntityType(e.target.value as (typeof ENTITY_TYPES)[number])
                    }
                  >
                    {ENTITY_TYPES.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Entity ID"
                  htmlFor="gen-eid"
                  help="UUID of the linked record."
                >
                  <Input
                    id="gen-eid"
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </Field>
              </div>
              {error && (
                <p className="text-xs text-danger" role="alert">
                  {error}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" size="sm" onClick={() => setView("pick")} disabled={pending}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={submitGenerate}
                disabled={pending || title.trim().length < 2 || entityId.trim().length < 10}
              >
                {pending ? "Generating…" : "Generate document"}
              </Button>
            </ModalFooter>
          </>
        )}

        {view === "create" && (
          <>
            <ModalHeader
              title="New template"
              description="Reusable document scaffold. Use {{placeholder}} tokens in the body."
              onClose={() => setOpen(false)}
            />
            <ModalBody className="flex flex-col gap-3">
              <Field label="Template name" htmlFor="tpl-name">
                <Input
                  id="tpl-name"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="Owner management agreement"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Document type" htmlFor="tpl-type">
                  <Select
                    id="tpl-type"
                    value={tType}
                    onChange={(e) => setTType(e.target.value as (typeof DOC_TYPES)[number])}
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default visibility" htmlFor="tpl-vis">
                  <Select
                    id="tpl-vis"
                    value={tVis}
                    onChange={(e) => setTVis(e.target.value as (typeof VISIBILITIES)[number])}
                  >
                    {VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Description (optional)" htmlFor="tpl-desc">
                <Input
                  id="tpl-desc"
                  value={tDesc}
                  onChange={(e) => setTDesc(e.target.value)}
                />
              </Field>
              <Field label="Body (optional)" htmlFor="tpl-body">
                <Textarea
                  id="tpl-body"
                  value={tBody}
                  onChange={(e) => setTBody(e.target.value)}
                  rows={4}
                  placeholder="This agreement is made between {{owner_name}} and Arconique…"
                />
              </Field>
              {error && (
                <p className="text-xs text-danger" role="alert">
                  {error}
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" size="sm" onClick={() => setView("pick")} disabled={pending}>
                Back
              </Button>
              <Button size="sm" onClick={submitCreate} disabled={pending || tName.trim().length < 2}>
                {pending ? "Saving…" : "Save template"}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </>
  );
}

"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/admin/form-shell";
import { createChecklistFromTemplateAction } from "@/features/operations/actions";

interface Option {
  id: string;
  label: string;
}

export function ChecklistFromTemplateForm({
  taskId,
  templates,
}: {
  taskId: string;
  templates: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");

  if (templates.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        No checklist templates available. Seed the database to populate them.
      </p>
    );
  }

  const onClick = () => {
    if (!templateId) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("taskId", taskId);
      fd.set("templateId", templateId);
      const res = await createChecklistFromTemplateAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="rounded-lg border border-dashed border-line-soft bg-muted/20 p-5 flex flex-col gap-3">
      <p className="text-sm text-ink-secondary">
        No checklist attached. Pick a template to instantiate one for this task.
      </p>
      <div className="flex items-center gap-2">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className={selectCls + " flex-1"}
        >
          <option value="">— Pick a template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!templateId || pending} onClick={onClick}>
          Attach
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

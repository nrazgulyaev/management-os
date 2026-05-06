# `src/components/forms/` — entity CRUD primitives

Stage 6.P0 introduces three small primitives that every Tier 1–5 entity form should use:

| Primitive | File | Purpose |
|---|---|---|
| `<EntityModal>` | [entity-modal.tsx](entity-modal.tsx) | Hosts a form (or any content) in a modal overlay. Uses native HTML5 `<dialog>` — no external library. Mobile-responsive. |
| `<EntityForm>` | [entity-form.tsx](entity-form.tsx) | Wraps the React-19 `useActionState + FormShell + SubmitButton + ActionResult` pattern. Use for *new* entity forms; existing hand-written forms (ProjectForm, VillaForm) already match the convention. |
| `<ConfirmDialog>` | [confirm-dialog.tsx](confirm-dialog.tsx) | Destructive-action confirmation. Wraps a server action in a small modal with cancel/destructive footer. |

## Conventions (locked in P0.2 decisions)

- **Modal pattern everywhere** for create + edit. Exception: project detail page (12-tab layout) keeps its full-page edit.
- **Workflow verbs**: form labels match action verbs. Use "Issue invoice from milestone" (not "Create invoice"), "Convert reservation to contract" (not "Create contract"), "Propose discount", "Record transaction", "Record safety incident", etc.
- **Mobile-friendly**: minimum 44 × 44 px touch targets. Inputs use the right `type` (`tel`, `email`, `number`, `date`). The `<EntityModal>` is full-screen on small viewports and centered on `md+`.
- **Audit trail**: every create/edit/delete already flows through `recordAuditEvent()` server-side via the existing action layer. No work needed here.
- **`"use server"` for client-imported actions**: every action file imported by a client component (forms included) carries the `"use server"` directive, NOT `import "server-only"`. Stage 5.J build-fix lesson — see [docs/development-os-architecture.md](../../../docs/development-os-architecture.md) Stage 5.J section.

## Pattern: list page → modal-driven CRUD

```tsx
// src/app/(development-app)/development-os/projects/page.tsx (server component)
import { ProjectsListClient } from "@/components/development/projects-list-client";

export default async function ProjectsPage() {
  const projects = await getDevelopmentProjects();
  return (
    <DevelopmentShell>
      <PageHeader title="Projects" />
      <ProjectsListClient projects={projects} />
    </DevelopmentShell>
  );
}

// src/components/development/projects-list-client.tsx (client component)
"use client";
import { useState } from "react";
import { EntityModal } from "@/components/forms/entity-modal";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { ProjectForm } from "@/features/projects/form";
import { archiveProjectAction } from "@/features/projects/actions";

export function ProjectsListClient({ projects }: { projects: ProjectRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [archiving, setArchiving] = useState<ProjectRow | null>(null);

  return (
    <>
      <Button onClick={() => setCreateOpen(true)}>+ New project</Button>
      <ProjectsList
        projects={projects}
        onEdit={setEditing}
        onArchive={setArchiving}
      />
      <EntityModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create project"
        size="lg"
      >
        <ProjectForm mode="create" />
      </EntityModal>
      <EntityModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit project"
        size="lg"
      >
        {editing && <ProjectForm mode="edit" defaults={editing} />}
      </EntityModal>
      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title="Archive project?"
        description="The project will be hidden from the active list."
        confirmLabel="Archive"
        action={archiveProjectAction}
        hiddenFields={archiving ? { id: archiving.id } : {}}
        onSuccess={() => setArchiving(null)}
      />
    </>
  );
}
```

## Pattern: building a new entity form (Tier 1+ work)

For entities that don't yet have a form (e.g. cost-categories, bank-accounts, transactions), use `<EntityForm>` to skip the boilerplate:

```tsx
"use client";
import { EntityForm } from "@/components/forms/entity-form";
import { Field, inputCls, selectCls } from "@/components/admin/form-shell";
import { createCostCategoryAction } from "@/lib/development/server/cost-category-actions";

export function CostCategoryForm({ defaults, onSuccess }: Props) {
  return (
    <EntityForm
      mode={defaults?.id ? "edit" : "create"}
      action={createCostCategoryAction}
      hiddenFields={{ id: defaults?.id }}
      title={null}              // bare form, EntityModal already has the header
      onSuccess={onSuccess}
    >
      {(errs) => (
        <>
          <Field label="Code" required error={errs.code?.[0]}>
            <input name="code" required defaultValue={defaults?.code} className={inputCls} />
          </Field>
          <Field label="Display name" required error={errs.name?.[0]}>
            <input name="name" required defaultValue={defaults?.name} className={inputCls} />
          </Field>
          <Field label="Category" required error={errs.category?.[0]}>
            <select name="category" required defaultValue={defaults?.category} className={selectCls}>
              <option value="construction">Construction</option>
              <option value="land">Land</option>
              <option value="overhead">Overhead</option>
            </select>
          </Field>
        </>
      )}
    </EntityForm>
  );
}
```

## What the existing `FormShell` family gives you

(Stage 2.x infra — already in the codebase, no Stage 6.P0 changes needed.)

- `FormShell` — outer card with optional title/description/footer
- `Field` — label + hint + error + child input
- `inputCls`, `selectCls`, `textareaCls` — Tailwind class strings for inputs
- `SubmitButton` — wraps `<Button type="submit">` with `useFormStatus()` pending state

## What we deliberately did NOT add

- **No toast library** (no `sonner`, no `react-hot-toast`). The existing `ActionResult` shape carries an explicit `error` string + `fieldErrors` map; the form renders these inline. A toast layer can be added in a later stage if real product feedback demands it. No new dependency in P0.
- **No Radix / Headless UI**. Native `<dialog>` covers focus trap, Escape, and backdrop with zero JS. Loses one IE11 user. We're fine with that.
- **No config-driven `<EntityForm fields={…}>` schema-renderer**. The launch prompt floated this; the existing hand-written forms are clearer + more flexible than a generic field-renderer. The render-prop on `<EntityForm>` (`children: (errs) => ReactNode`) gives the same type-safety without the config layer.

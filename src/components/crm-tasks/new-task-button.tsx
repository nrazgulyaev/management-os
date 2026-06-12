"use client";

/**
 * "New task" button for the My-tasks page (/dashboard/tasks).
 *
 * The page used to only direct users to create tasks from a record's Tasks
 * tab. This adds a direct create affordance, reusing the existing, secured
 * createTask server action (requirePermission('crm_tasks.write') +
 * requireOrgId()). A task must attach to a CRM subject; v1 supports owners
 * (the only subject My-tasks can deep-link back to), via an owner picker.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { createTask } from "@/features/crm-tasks/actions";

export interface NewTaskButtonProps {
  owners: { id: string; name: string }[];
  assignableUsers: { id: string; name: string }[];
}

export function NewTaskButton({ owners, assignableUsers }: NewTaskButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [ownerId, setOwnerId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [priority, setPriority] = React.useState("normal");
  const [assignee, setAssignee] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dirty =
    ownerId !== "" || title.trim() !== "" || body.trim() !== "" || dueAt !== "";

  function reset() {
    setOwnerId("");
    setTitle("");
    setBody("");
    setDueAt("");
    setPriority("normal");
    setAssignee("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (ownerId === "") {
      setError("Pick an owner to attach the task to.");
      return;
    }
    if (title.trim() === "") {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    const res = await createTask({
      subjectType: "owner",
      subjectId: ownerId,
      title: title.trim(),
      body: body.trim() === "" ? null : body.trim(),
      dueAt: dueAt === "" ? null : new Date(dueAt).toISOString(),
      priority: priority as "low" | "normal" | "high",
      assigneeUserId: assignee === "" ? null : assignee,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New task
      </Button>
      <Modal open={open} onOpenChange={setOpen} size="sm" dirty={dirty}>
        <ModalHeader title="New task" />
        <ModalBody className="flex flex-col gap-3">
          {owners.length === 0 ? (
            <p className="text-[13px] text-ink-tertiary">
              Add an owner first — tasks attach to a CRM record.
            </p>
          ) : (
            <>
              <Field label="Owner" htmlFor="new-task-owner">
                <Select
                  id="new-task-owner"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                >
                  <option value="">Select an owner…</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Title" htmlFor="new-task-title">
                <Input
                  id="new-task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Call back about the contract"
                  autoFocus
                />
              </Field>
              <Field label="Details (optional)" htmlFor="new-task-body">
                <Textarea
                  id="new-task-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={2}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Due" htmlFor="new-task-due">
                  <Input
                    id="new-task-due"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </Field>
                <Field label="Priority" htmlFor="new-task-priority">
                  <Select
                    id="new-task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </Select>
                </Field>
              </div>
              <Field label="Assign to" htmlFor="new-task-assignee">
                <Select
                  id="new-task-assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">Me (default)</option>
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {error && (
            <p className="text-[12px] text-danger" role="alert">
              {error}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || owners.length === 0}>
            {saving ? "Adding…" : "Create task"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

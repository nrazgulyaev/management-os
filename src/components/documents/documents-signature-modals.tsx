"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSignatureRequestAction } from "@/features/documents/app-actions";

const ROLES = ["owner", "guest", "supplier", "counterparty", "internal"] as const;

export function SignatureRequestButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<(typeof ROLES)[number]>("owner");
  const [message, setMessage] = React.useState("");

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await createSignatureRequestAction({
        documentId,
        signerName: name,
        signerEmail: email,
        signerRole: role,
        message,
      });
      if (!r.ok) setError(r.error);
      else {
        setOpen(false);
        setName("");
        setEmail("");
        setMessage("");
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setOpen(true)}>
        Request signature
      </Button>
      <Modal open={open} onOpenChange={setOpen} size="sm" ariaLabel="Request signature">
        <ModalHeader
          title="Request e-signature"
          description="Sends a manual signing request. No external provider is wired — operators mark it countersigned when received."
          onClose={() => setOpen(false)}
        />
        <ModalBody className="flex flex-col gap-3">
          <Field label="Signer name" htmlFor="sig-name">
            <Input
              id="sig-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Owner"
            />
          </Field>
          <Field label="Signer email (optional)" htmlFor="sig-email">
            <Input
              id="sig-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </Field>
          <Field label="Role" htmlFor="sig-role">
            <Select
              id="sig-role"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Message (optional)" htmlFor="sig-msg">
            <Textarea
              id="sig-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Please review and sign the attached contract."
            />
          </Field>
          {error && (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending || name.trim().length < 2}>
            {pending ? "Sending…" : "Send request"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

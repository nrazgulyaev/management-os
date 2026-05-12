"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { ContactForm } from "./contact-form";

export function ContactAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Add contact"
      modalTitle="Add emergency contact"
      formComponent={ContactForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/villa-guides/emergency-contacts/new"
      size="lg"
      testId="emergency-contact-add-trigger"
    />
  );
}

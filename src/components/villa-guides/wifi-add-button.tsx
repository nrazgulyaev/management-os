/**
 * Stage 10.6.B.4 — Modal-First Add for Wi-Fi credentials.
 */
"use client";

import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { WifiForm } from "./wifi-form";

export function WifiAddButton({
  villas,
  projects,
}: {
  villas: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  return (
    <ModalFirstAddButton
      label="Add Wi-Fi"
      modalTitle="Add Wi-Fi credentials"
      modalDescription="Passwords are encrypted at rest with AES-256-GCM. Leave the password blank to keep an existing one when editing."
      formComponent={WifiForm}
      formProps={{ villas, projects }}
      newRouteHref="/dashboard/villa-guides/wifi/new"
      size="lg"
      testId="wifi-add-trigger"
    />
  );
}

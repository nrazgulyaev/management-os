"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function SubmitButton({
  children = "Save",
  pendingLabel,
  ...rest
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || rest.disabled} {...rest}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </Button>
  );
}

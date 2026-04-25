import { OwnerShell } from "@/components/layout/owner-shell";

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OwnerShell>{children}</OwnerShell>;
}

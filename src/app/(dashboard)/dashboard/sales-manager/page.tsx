import { redirect } from "next/navigation";

/** Stage 10.5.A.3.4 — Dev OS cabinet redirect. */
export const dynamic = "force-dynamic";

export default function SalesManagerRedirectPage() {
  redirect("/development-os/cabinets/sales-manager");
}

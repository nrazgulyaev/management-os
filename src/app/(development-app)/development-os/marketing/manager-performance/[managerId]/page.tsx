import { permanentRedirect } from "next/navigation";

/**
 * Legacy route — per-manager snapshots now live at
 * /development-os/marketing/performance/[managerId] (DS restyle).
 * Kept as a redirect so old links keep working.
 */
export const dynamic = "force-dynamic";

export default async function LegacyManagerDetailPage({
  params,
}: {
  params: Promise<{ managerId: string }>;
}) {
  const { managerId } = await params;
  permanentRedirect(
    `/development-os/marketing/performance/${encodeURIComponent(managerId)}`,
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listBuckets } from "@/features/system/storage-overview";

export const metadata = { title: "Storage health overview" };
export const dynamic = "force-dynamic";

export default async function StorageOverviewPage() {
  const buckets = listBuckets();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "System", href: "/dashboard" },
          { label: "Storage" },
        ]}
        title="Storage health overview"
        description="Every Supabase Storage bucket the platform expects, its privacy classification, and the deep-link to its dedicated health page where applicable."
      />

      <Section
        eyebrow="1"
        title="Bucket inventory"
        description="Cross-reference with docs/STORAGE-BUCKETS-CHECKLIST.md. The static check `npm run check:storage` keeps this list in sync with the docs."
      >
        <Table>
          <THead>
            <TR>
              <TH>Bucket</TH>
              <TH>Privacy</TH>
              <TH>Used by</TH>
              <TH>Max size</TH>
              <TH>Cleanup</TH>
              <TH>EXIF strip</TH>
              <TH>Health page</TH>
            </TR>
          </THead>
          <TBody>
            {buckets.map((b) => (
              <TR key={b.name}>
                <TD className="font-mono text-xs">{b.name}</TD>
                <TD>
                  <Badge tone={b.privacy === "private" ? "success" : "danger"}>
                    {b.privacy}
                  </Badge>
                </TD>
                <TD className="text-xs text-ink-secondary">{b.usedBy}</TD>
                <TD className="text-xs tabular-nums">
                  {b.maxSizeMb !== null ? `${b.maxSizeMb} MiB` : "—"}
                </TD>
                <TD>
                  {b.hasCleanupCron ? (
                    <Badge tone="success">cron</Badge>
                  ) : (
                    <Badge tone="neutral">manual</Badge>
                  )}
                </TD>
                <TD>
                  {b.hasMetadataStrip ? (
                    <Badge tone="success">yes</Badge>
                  ) : (
                    <Badge tone="warning">no</Badge>
                  )}
                </TD>
                <TD>
                  {b.name === "guest-request-attachments" ? (
                    <Link
                      className="text-accent text-xs underline"
                      href="/dashboard/guest-ai/storage"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-tertiary">
                      No live check yet
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section
        eyebrow="2"
        title="Operator runbook"
        description="When a bucket is misconfigured, follow these steps."
      >
        <ol className="list-decimal pl-5 text-sm text-ink-secondary space-y-2">
          <li>
            Run{" "}
            <code className="font-mono text-xs bg-canvas-elevated px-1.5 py-0.5 rounded">
              npm run check:storage
            </code>{" "}
            to confirm every bucket constant in code is present in the docs.
          </li>
          <li>
            Visit{" "}
            <Link
              className="text-accent underline"
              href="/dashboard/guest-ai/storage"
            >
              /dashboard/guest-ai/storage
            </Link>{" "}
            for live bucket-exists / signed-URL probes for{" "}
            <code className="font-mono text-xs">guest-request-attachments</code>.
          </li>
          <li>
            For <code className="font-mono text-xs">task-attachments</code>,
            verify in Supabase Studio → Storage that the bucket is{" "}
            <strong>private</strong> and that the RLS policies on{" "}
            <code className="font-mono text-xs">storage.objects</code> only
            allow the service role to read/write.
          </li>
          <li>
            See{" "}
            <Link
              className="text-accent underline"
              href="/dashboard/system/deployment"
            >
              /dashboard/system/deployment
            </Link>{" "}
            for the broader env + production-gate readiness signal.
          </li>
        </ol>
      </Section>
    </div>
  );
}

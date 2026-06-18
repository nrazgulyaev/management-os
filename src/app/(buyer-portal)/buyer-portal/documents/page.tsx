import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  FileText,
  Image as ImageIcon,
  FileBadge,
  Receipt,
  File as FileIcon,
  Download,
} from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import {
  getBuyerDocuments,
  formatFileSize,
  type BuyerDocGroupKey,
} from "@/lib/buyer-portal/documents";

export const metadata: Metadata = { title: "Documents · Buyer Portal" };
export const dynamic = "force-dynamic";

const GROUP_ICON: Record<
  BuyerDocGroupKey,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  contract: FileText,
  plans: ImageIcon,
  permits: FileBadge,
  receipts: Receipt,
  other: FileIcon,
};

function fileIconFor(documentType: string, mimeType: string | null) {
  if (mimeType?.startsWith("image/")) return ImageIcon;
  switch (documentType) {
    case "contract":
      return FileText;
    case "invoice":
    case "receipt":
      return Receipt;
    case "permit":
    case "certificate":
      return FileBadge;
    case "plan":
    case "render":
    case "drawing":
    case "photo":
      return ImageIcon;
    default:
      return FileIcon;
  }
}

export default async function BuyerDocumentsPage() {
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const buyer = session;

  const { groups, totalCount } = await getBuyerDocuments(buyer.buyerId);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink mb-1">
          Documents
        </h2>
        <p className="text-sm text-ink-secondary">
          {totalCount === 0
            ? "Documents shared with you appear here — your contract, plans and renders, permits, and payment receipts."
            : `${totalCount} document${totalCount === 1 ? "" : "s"} on file across your villa${
                totalCount === 1 ? "" : "s"
              }, grouped by type.`}
        </p>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
          Nothing shared yet. Your contract, architectural plans, building
          permits, and payment receipts appear here as soon as our team uploads
          them.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const GroupIcon = GROUP_ICON[group.key];
            return (
              <section
                key={group.key}
                className="rounded-lg border border-line-soft bg-surface"
              >
                <header className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
                  <GroupIcon
                    className="w-5 h-5 text-ink-secondary"
                    strokeWidth={1.5}
                  />
                  <div>
                    <h3 className="font-display text-lg tracking-wide text-ink">
                      {group.title}
                    </h3>
                    <p className="text-xs text-ink-tertiary">{group.helper}</p>
                  </div>
                </header>
                <ul className="divide-y divide-line-soft">
                  {group.documents.map((doc) => {
                    const Icon = fileIconFor(doc.documentType, doc.mimeType);
                    return (
                      <li
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted">
                            <Icon
                              className="h-4 w-4 text-ink-secondary"
                              strokeWidth={1.75}
                            />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-ink">
                              {doc.title}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-tertiary">
                              {formatFileSize(doc.sizeBytes)}
                              {" · "}
                              {doc.createdAt.toISOString().slice(0, 10)}
                              {doc.fileName ? ` · ${doc.fileName}` : ""}
                            </div>
                          </div>
                        </div>
                        {doc.downloadUrl ? (
                          <a
                            href={doc.downloadUrl}
                            className="inline-flex items-center gap-1.5 rounded border border-line-soft px-3 py-1.5 text-sm text-ink-secondary transition hover:bg-muted"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4" strokeWidth={1.75} />
                            Download
                          </a>
                        ) : (
                          <span className="text-xs italic text-ink-tertiary">
                            No file attached
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-tertiary">
        Looking for your payment schedule? Open the Payments page. Download links
        are private to your account and expire after one hour.
      </p>
    </BuyerShell>
  );
}

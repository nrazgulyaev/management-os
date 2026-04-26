import Image from "next/image";
import { FileText, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AttachmentRow } from "@/features/attachments/services";

export function AttachmentGallery({
  attachments,
  emptyLabel = "No attachments yet.",
}: {
  attachments: AttachmentRow[];
  emptyLabel?: string;
}) {
  if (attachments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {attachments.map((a) => (
        <Tile key={a.id} attachment={a} />
      ))}
    </div>
  );
}

function Tile({ attachment }: { attachment: AttachmentRow }) {
  const isImage = attachment.mimeType?.startsWith("image/");
  const isPending = attachment.uploadStatus !== "uploaded";
  return (
    <a
      href={attachment.signedUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!attachment.signedUrl) e.preventDefault();
      }}
      className="rounded-md border border-line-soft bg-surface overflow-hidden flex flex-col hover:border-line-strong transition-colors"
    >
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {isImage && attachment.signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <Image
            src={attachment.signedUrl}
            alt={attachment.fileName ?? "attachment"}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover"
            unoptimized
          />
        ) : isImage ? (
          <ImageIcon className="w-8 h-8 text-ink-tertiary" strokeWidth={1.5} />
        ) : (
          <FileText className="w-8 h-8 text-ink-tertiary" strokeWidth={1.5} />
        )}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/80">
            <Badge tone="warning">{attachment.uploadStatus}</Badge>
          </div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-0.5">
        <div className="text-[11px] text-ink truncate" title={attachment.fileName ?? ""}>
          {attachment.fileName ?? "Attachment"}
        </div>
        <div className="text-[10px] text-ink-tertiary">
          {attachment.uploadedByName ?? "—"}
          {attachment.sizeBytes
            ? ` · ${(attachment.sizeBytes / 1024).toFixed(0)} KB`
            : ""}
        </div>
      </div>
    </a>
  );
}

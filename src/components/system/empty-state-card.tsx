import Link from "next/link";

/**
 * Prompt 112 — Polished empty-state card shown when a query
 * succeeded but returned zero rows.  Caller passes a CTA link to the
 * page that creates the missing data (or a `npm run db:seed` hint).
 */
export function EmptyStateCard({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-8 flex flex-col gap-2 items-start">
      <div className="text-sm text-ink font-medium">{title}</div>
      <p className="text-xs text-ink-tertiary leading-relaxed max-w-prose">
        {description}
      </p>
      {cta && (
        <Link
          href={cta.href}
          className="text-xs text-ink hover:underline underline-offset-4 mt-1"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}

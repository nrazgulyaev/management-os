import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Circle,
  CreditCard,
  FileSignature,
  ImageIcon,
  MapPin,
} from "lucide-react";
import { BuyerShell } from "@/components/buyer-portal/buyer-shell";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { getBuyerSession } from "@/lib/buyer-portal/session";
import {
  loadBuyerUnitDetail,
  type BuyerUnitDetail,
  type BuyerUnitMilestone,
} from "@/lib/buyer-portal/units";
import { formatMoneyMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Villa detail · Buyer Portal" };
export const dynamic = "force-dynamic";

// Construction milestone status → calm badge tone + label.
const MILESTONE_TONE: Record<
  BuyerUnitMilestone["status"],
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  done: "success",
  in_progress: "info",
  at_risk: "warning",
  slipped: "danger",
  planned: "neutral",
};

const MILESTONE_LABEL: Record<BuyerUnitMilestone["status"], string> = {
  done: "Complete",
  in_progress: "In progress",
  at_risk: "At risk",
  slipped: "Delayed",
  planned: "Planned",
};

function specRow(label: string, value: string | null) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function area(value: number | null, unit = "m²") {
  return value == null ? null : `${value.toLocaleString()} ${unit}`;
}

export default async function BuyerUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getBuyerSession();
  if (!session) redirect("/buyer-portal/login");
  const db = getDb();
  if (!db) redirect("/buyer-portal/login");
  const buyer = session;

  // OWNERSHIP-SCOPED: returns null when this unit is not assigned to the
  // authenticated buyer (or not portal-visible). 404 keeps the unit id opaque.
  const detail: BuyerUnitDetail | null = await loadBuyerUnitDetail(
    buyer.buyerId,
    id,
  );
  if (!detail) notFound();

  const { unit, project, spec, milestones, latestReport, photos, money } =
    detail;

  // Construction % — prefer the published report's stated %, fall back to the
  // milestone-derived ratio.
  const progressPct =
    latestReport?.currentProgressPercentage != null
      ? Math.round(latestReport.currentProgressPercentage)
      : detail.constructionPercent;

  const heroPhoto = photos[0];
  const heroUrl = heroPhoto?.url ?? project.heroImageUrl ?? null;
  const galleryPhotos = photos.filter((p) => p.id !== heroPhoto?.id);

  const amenities = [
    spec.bedrooms ? `${spec.bedrooms} bed` : null,
    spec.bathrooms ? `${spec.bathrooms} bath` : null,
    spec.viewType ? spec.viewType.replace(/_/g, " ") : null,
    area(spec.builtAreaSqm) ? `${area(spec.builtAreaSqm)} built` : null,
  ].filter((x): x is string => x != null);

  return (
    <BuyerShell buyerName={buyer.displayName} buyerCode={buyer.buyerCode}>
      <Link
        href="/buyer-portal/units"
        className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        My villas
      </Link>

      {/* Identity hero */}
      <section className="overflow-hidden rounded-lg border border-line-soft bg-surface">
        <div className="relative aspect-[16/7] bg-muted">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <Image
              src={heroUrl}
              alt={unit.label}
              fill
              sizes="(max-width: 768px) 100vw, 960px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-mono text-sm text-ink-tertiary">
                {unit.unitCode}
              </span>
            </div>
          )}
        </div>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono text-xs text-ink-tertiary">
                {unit.unitCode}
              </div>
              <h2 className="font-display text-2xl tracking-wide text-ink">
                {unit.label}
              </h2>
              <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-secondary">
                <MapPin className="h-4 w-4" strokeWidth={1.5} />
                {project.name} · {project.location}
                {project.area ? ` · ${project.area}` : ""}
              </div>
            </div>
            <Badge tone="outline">
              {detail.assignment.status.replace(/_/g, " ")}
            </Badge>
          </div>
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {amenities.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-line-soft bg-muted/40 px-2.5 py-0.5 text-xs capitalize text-ink-secondary"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
          {project.concept && (
            <p className="text-sm leading-relaxed text-ink-secondary">
              {project.concept}
            </p>
          )}
        </div>
      </section>

      {/* Construction progress */}
      <section className="rounded-lg border border-line-soft bg-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink-secondary">
            Construction progress
          </h3>
          {progressPct != null && (
            <span className="font-display text-xl text-ink">
              {progressPct}%
            </span>
          )}
        </div>

        {progressPct != null ? (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full bg-success transition-all ${
                progressPct >= 100
                  ? "w-full"
                  : progressPct >= 75
                    ? "w-3/4"
                    : progressPct >= 50
                      ? "w-1/2"
                      : progressPct >= 25
                        ? "w-1/4"
                        : "w-[8%]"
              }`}
            />
          </div>
        ) : (
          <p className="text-sm text-ink-tertiary">
            Construction milestones for this villa have not been published yet.
          </p>
        )}

        {project.targetHandoverDate && (
          <p className="text-xs text-ink-tertiary">
            Target handover {project.targetHandoverDate}
            {latestReport?.expectedHandoverDate &&
              latestReport.expectedHandoverDate !==
                project.targetHandoverDate &&
              ` · currently expecting ${latestReport.expectedHandoverDate}`}
          </p>
        )}

        {milestones.length > 0 && (
          <ol className="space-y-1.5 pt-1">
            {milestones.map((m) => {
              const done = m.status === "done";
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {done ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-success"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Circle
                        className="h-4 w-4 shrink-0 text-ink-tertiary"
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="truncate text-sm text-ink">{m.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-ink-tertiary">
                      {m.actualDate ?? m.targetDate}
                    </span>
                    <Badge tone={MILESTONE_TONE[m.status]}>
                      {MILESTONE_LABEL[m.status]}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {latestReport && (
          <div className="rounded-md border border-line-soft bg-muted/20 p-4">
            <div className="text-xs text-ink-tertiary">
              Latest update · period ending {latestReport.reportingPeriodEnd}
            </div>
            {latestReport.nextMilestone && (
              <div className="mt-1 text-sm font-medium text-ink">
                {latestReport.nextMilestone}
              </div>
            )}
            {latestReport.worksCompletedSummary && (
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-secondary">
                {latestReport.worksCompletedSummary}
              </p>
            )}
            <Link
              href={`/buyer-portal/reports/${latestReport.id}`}
              className="mt-2 inline-block text-sm text-ink-secondary underline transition-colors hover:text-ink"
            >
              Read the full report
            </Link>
          </div>
        )}
      </section>

      {/* Plans, renders & photos */}
      <section className="rounded-lg border border-line-soft bg-surface p-5 space-y-3">
        <h3 className="text-sm font-medium text-ink-secondary">
          Plans, renders &amp; photos
        </h3>
        {galleryPhotos.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
            Renders and site photography appear here as they are published.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {galleryPhotos.map((p) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-[4/3] overflow-hidden rounded-md border border-line-soft bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <Image
                  src={p.url}
                  alt={p.caption ?? `${unit.label} — ${p.kind}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-[1.03]"
                  unoptimized
                />
                <span className="absolute left-2 top-2 rounded-full bg-canvas/85 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-secondary">
                  {p.kind.replace(/_/g, " ")}
                </span>
                {p.caption && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/70 to-transparent px-2 py-1.5 text-[11px] text-canvas">
                    {p.caption}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Spec + money/links, side by side on desktop */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Specification */}
        <div className="rounded-lg border border-line-soft bg-surface p-5">
          <h3 className="mb-1 text-sm font-medium text-ink-secondary">
            Specification
          </h3>
          <dl className="divide-y divide-line-soft">
            {specRow(
              "Bedrooms",
              spec.bedrooms ? String(spec.bedrooms) : null,
            )}
            {specRow(
              "Bathrooms",
              spec.bathrooms != null ? String(spec.bathrooms) : null,
            )}
            {specRow("Built area", area(spec.builtAreaSqm))}
            {specRow("Land area", area(spec.landAreaSqm))}
            {specRow("Pool area", area(spec.poolAreaSqm))}
            {specRow(
              "View",
              spec.viewType ? spec.viewType.replace(/_/g, " ") : null,
            )}
            {specRow(
              "Leasehold until",
              project.leaseholdUntil,
            )}
          </dl>
        </div>

        {/* Money + cross-links */}
        <div className="rounded-lg border border-line-soft bg-surface p-5 space-y-4">
          <h3 className="text-sm font-medium text-ink-secondary">
            Your purchase
          </h3>
          {money.hasContract ? (
            <>
              <div>
                <div className="text-xs text-ink-tertiary">
                  Total contract value
                </div>
                <div className="font-mono text-lg text-ink">
                  {formatMoneyMinor(money.totalContractValueUsdMinor, "USD")}
                </div>
              </div>
              {money.milestoneCount > 0 && (
                <div>
                  <div className="text-xs text-ink-tertiary">Paid to date</div>
                  <div className="font-mono text-sm text-ink">
                    {formatMoneyMinor(money.paidUsdMinor, "USD")} /{" "}
                    {formatMoneyMinor(money.expectedUsdMinor, "USD")}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-tertiary">
                    {money.paidMilestoneCount} of {money.milestoneCount}{" "}
                    installments settled
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-tertiary">
              Your contract and payment schedule appear here once they are
              prepared.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Link
              href="/buyer-portal/payments"
              className="inline-flex items-center gap-2 rounded-md border border-line-soft bg-muted/30 px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-muted hover:text-ink"
            >
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
              View payment schedule
            </Link>
            <Link
              href="/buyer-portal/contract"
              className="inline-flex items-center gap-2 rounded-md border border-line-soft bg-muted/30 px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-muted hover:text-ink"
            >
              <FileSignature className="h-4 w-4" strokeWidth={1.5} />
              View &amp; sign contract
            </Link>
            <Link
              href="/buyer-portal/reports"
              className="inline-flex items-center gap-2 rounded-md border border-line-soft bg-muted/30 px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-muted hover:text-ink"
            >
              <Building className="h-4 w-4" strokeWidth={1.5} />
              All progress reports
            </Link>
          </div>
        </div>
      </section>

      <p className="text-[11px] text-ink-tertiary">
        Reserved {detail.assignment.assignedAt}
        {detail.assignment.contractedAt &&
          ` · contracted ${detail.assignment.contractedAt}`}
        {detail.assignment.handedOverAt &&
          ` · handed over ${detail.assignment.handedOverAt}`}
      </p>
    </BuyerShell>
  );
}

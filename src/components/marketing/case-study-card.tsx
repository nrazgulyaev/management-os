import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface CaseStudyMeta {
  slug: string;
  eyebrow: string;
  title: string;
  excerpt: string;
  metric: string;
  metricLabel?: string;
  project: string;
  thesis?: string;
  model?: string;
  status?: string;
  focus?: string;
  reportingAngle?: string;
  hero?: string;
}

export function CaseStudyCard({ study }: { study: CaseStudyMeta }) {
  return (
    <article className="group rounded-lg border border-line-soft bg-surface overflow-hidden flex flex-col">
      {study.hero && (
        <div
          className="aspect-[16/9] relative"
          style={{ background: study.hero, backgroundColor: "var(--muted)" }}
        >
          <div className="absolute inset-0 p-5 flex items-start justify-between">
            <Badge tone="outline">{study.eyebrow}</Badge>
            {study.status && <Badge tone="gold">{study.status}</Badge>}
          </div>
        </div>
      )}
      <div className="p-7 md:p-8 flex flex-col gap-5 flex-1">
        <div>
          <h3 className="text-display text-[24px] md:text-[28px] leading-[1.1] font-medium text-ink">
            {study.title}
          </h3>
          <p className="text-sm text-ink-secondary mt-3 leading-relaxed">
            {study.excerpt}
          </p>
        </div>

        {(study.thesis || study.model || study.focus || study.reportingAngle) && (
          <dl className="grid grid-cols-2 gap-4 pt-2">
            {study.model && (
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  Model
                </dt>
                <dd className="text-sm text-ink mt-1">{study.model}</dd>
              </div>
            )}
            {study.focus && (
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  Operations focus
                </dt>
                <dd className="text-sm text-ink mt-1">{study.focus}</dd>
              </div>
            )}
            {study.thesis && (
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  Thesis
                </dt>
                <dd className="text-sm text-ink mt-1 leading-relaxed">
                  {study.thesis}
                </dd>
              </div>
            )}
            {study.reportingAngle && (
              <div className="col-span-2">
                <dt className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                  Investor reporting angle
                </dt>
                <dd className="text-sm text-ink mt-1 leading-relaxed">
                  {study.reportingAngle}
                </dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-auto pt-5 border-t border-line-soft flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              {study.metricLabel ?? "Modelled metric"}
            </div>
            <div className="font-mono tabular-nums text-base text-ink mt-1">
              {study.metric}
            </div>
          </div>
          <Link
            href={`/case-studies#${study.slug}`}
            className="inline-flex items-center gap-1 text-sm text-ink hover:text-accent transition-colors"
          >
            Read more
            <ArrowUpRight
              className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
              strokeWidth={1.75}
            />
          </Link>
        </div>
      </div>
    </article>
  );
}

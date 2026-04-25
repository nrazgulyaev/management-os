import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MockProject } from "@/lib/mock/projects";

const modelLabel: Record<MockProject["ownershipModel"], string> = {
  individual: "Individual ownership",
  pooled: "Pooled profit",
  hybrid: "Hybrid allocation",
};

export function ProjectCard({ project }: { project: MockProject }) {
  return (
    <Link
      href={`/portfolio#${project.id}`}
      className="group rounded-lg border border-line-soft bg-surface overflow-hidden flex flex-col hover:border-line-strong transition-colors"
    >
      <div
        className="aspect-[16/10] relative"
        style={{ background: project.heroPhoto, backgroundColor: "var(--muted)" }}
      >
        <div className="absolute inset-0 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <Badge tone="outline">{project.code}</Badge>
            {project.status === "live" ? (
              <Badge tone="success">Live</Badge>
            ) : project.status === "soft_open" ? (
              <Badge tone="gold">Soft open</Badge>
            ) : (
              <Badge tone="info">Development</Badge>
            )}
          </div>
          <div className="text-ink-inverse drop-shadow-sm">
            <span className="text-[11px] uppercase tracking-[0.18em] opacity-80">
              {modelLabel[project.ownershipModel]}
            </span>
          </div>
        </div>
      </div>
      <div className="p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-display text-[22px] leading-tight font-medium text-ink">
            {project.name}
          </h3>
          <ArrowUpRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink transition-colors" />
        </div>
        <p className="text-sm text-ink-secondary leading-relaxed">
          {project.tagline}
        </p>
        <div className="flex items-center gap-1 text-xs text-ink-tertiary">
          <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
          {project.area}
          <span className="mx-2">·</span>
          {project.villas} villas
          <span className="mx-2">·</span>
          {project.bedrooms} bedrooms
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-4 border-t border-line-soft">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              Occupancy
            </div>
            <div className="font-mono tabular-nums text-sm text-ink mt-1">
              {project.occupancy.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              ADR
            </div>
            <div className="font-mono tabular-nums text-sm text-ink mt-1">
              Rp {(project.adr / 100_000_000).toFixed(1)}M
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              RevPAR
            </div>
            <div className="font-mono tabular-nums text-sm text-ink mt-1">
              Rp {(project.revpar / 100_000_000).toFixed(1)}M
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

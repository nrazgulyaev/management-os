import Link from "next/link";

/**
 * Segmentation view switcher — mock §02 "Variants":
 * A insights+risk (default) · B tier matrix · C churn cohort with LTV.
 */

export type IntelView = "insights" | "tier-matrix" | "cohort";

const VIEWS: { key: IntelView; href: string; label: string }[] = [
  { key: "insights", href: "/dashboard/owner-intelligence", label: "A · Insights + risk" },
  { key: "tier-matrix", href: "/dashboard/owner-intelligence/tier-matrix", label: "B · Tier matrix" },
  { key: "cohort", href: "/dashboard/owner-intelligence/cohort", label: "C · Churn cohort" },
];

export function IntelViewSwitcher({ active }: { active: IntelView }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="navigation" aria-label="Segmentation views">
      <span className="label">Views</span>
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          aria-current={v.key === active ? "page" : undefined}
          className={`btn btn-sm ${v.key === active ? "btn-accent" : "btn-secondary"}`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}

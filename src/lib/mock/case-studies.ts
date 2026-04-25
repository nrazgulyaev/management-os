import type { CaseStudyMeta } from "@/components/marketing/case-study-card";

export const caseStudies: CaseStudyMeta[] = [
  {
    slug: "enso-pool-performance",
    eyebrow: "Pooled-ownership model",
    title: "An eight-villa pool, modelled to deliver smoothed yield.",
    excerpt:
      "Enso Villas is designed as a pooled asset: members hold a weighted share of net operating profit. Occupancy smoothing across eight villas reduces single-villa variance.",
    project: "Enso Villas",
    metric: "10.6% modelled yield",
    metricLabel: "Year-three target",
    thesis:
      "Pooled distribution reduces month-to-month variance for owners and aligns operational incentives across the complex.",
    model: "Pooled · 8 villas",
    status: "Live · demo",
    focus: "Channel mix, dynamic pricing, shared reserves",
    reportingAngle:
      "Versioned allocation rules; pool members receive a single signed monthly statement with weighted distribution.",
    hero: "linear-gradient(180deg, rgba(176,138,62,0.18) 0%, rgba(15,17,16,0.55) 100%)",
  },
  {
    slug: "eternal-hybrid",
    eyebrow: "Hybrid allocation",
    title: "Individual P&L. Shared costs. Reconciled to the line.",
    excerpt:
      "Eternal Villas operates on a hybrid model: each owner's villa-specific revenue and costs stay with them while shared services follow an immutable, version-controlled allocation rule.",
    project: "Eternal Villas",
    metric: "Zero retroactive rewrites",
    metricLabel: "Statement guarantee",
    thesis:
      "Owners want clarity on their villa's performance and confidence that shared costs are calculated by a documented rule.",
    model: "Hybrid · 6 villas",
    status: "Live · demo",
    focus: "Allocation rules, owner approvals, statement integrity",
    reportingAngle:
      "Each statement records the allocation-rule version active for the period; future rule changes never alter past statements.",
    hero: "linear-gradient(180deg, rgba(14,59,46,0.18) 0%, rgba(14,59,46,0.6) 100%)",
  },
  {
    slug: "ahau-operations",
    eyebrow: "Operations rebuild",
    title: "From WhatsApp coordination to a 3-day monthly close — modelled.",
    excerpt:
      "Ahau Gardens is the smallest project in the demo portfolio, designed to test how individually-owned villas with shared landscape and security run on the same OS as larger pools.",
    project: "Ahau Gardens",
    metric: "3-day close target",
    metricLabel: "Modelled scenario",
    thesis:
      "Small projects benefit most from operational consolidation; one platform replaces five tools.",
    model: "Individual · 5 villas",
    status: "Soft open · demo",
    focus: "Turnover quality, preventive scheduling, procurement",
    reportingAngle:
      "Each owner receives a dedicated statement with their villa's full P&L and a transparent shared-cost line.",
    hero: "linear-gradient(180deg, rgba(110,138,122,0.18) 0%, rgba(15,17,16,0.6) 100%)",
  },
];

"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createProjectRisk } from "@/lib/development/server/risks/risk-actions";

const PROBABILITIES = [
  { v: "very_low", label: "Very low", score: 1 },
  { v: "low", label: "Low", score: 2 },
  { v: "medium", label: "Medium", score: 3 },
  { v: "high", label: "High", score: 4 },
  { v: "very_high", label: "Very high", score: 5 },
] as const;

const IMPACTS = [
  { v: "minor", label: "Minor", score: 1 },
  { v: "moderate", label: "Moderate", score: 2 },
  { v: "major", label: "Major", score: 3 },
  { v: "severe", label: "Severe", score: 4 },
  { v: "catastrophic", label: "Catastrophic", score: 5 },
] as const;

const CATEGORIES = [
  "land_legal",
  "permit_delay",
  "weather",
  "supplier_delay",
  "fx_currency",
  "buyer_payment_delay",
  "cost_overrun",
  "quality_issue",
  "labor_shortage",
  "investor_funding_delay",
  "tax_uncertainty",
  "design_change",
  "safety",
  "other",
] as const;

function scoreTone(score: number): "danger" | "warning" | "info" | "neutral" {
  if (score >= 15) return "danger";
  if (score >= 8) return "warning";
  if (score >= 4) return "info";
  return "neutral";
}

export function RiskForm({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("other");
  const [probability, setProbability] = useState<
    typeof PROBABILITIES[number]["v"]
  >("medium");
  const [impact, setImpact] = useState<typeof IMPACTS[number]["v"]>("moderate");
  const [mitigationPlan, setMitigationPlan] = useState("");
  const [error, setError] = useState<string | null>(null);

  const previewScore = useMemo(() => {
    const p = PROBABILITIES.find((x) => x.v === probability)!.score;
    const i = IMPACTS.find((x) => x.v === impact)!.score;
    return p * i;
  }, [probability, impact]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required");
      return;
    }
    startTransition(async () => {
      try {
        const out = await createProjectRisk({
          title,
          projectId,
          description,
          category,
          probability,
          impact,
          mitigationPlan: mitigationPlan || null,
        });
        router.push(
          `/development-os/projects/${projectSlug}/risks/${out.riskCode}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Create failed");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-2xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Pool excavation may hit aquifer"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-secondary">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-ink-secondary">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Probability</span>
          <select
            value={probability}
            onChange={(e) =>
              setProbability(e.target.value as typeof probability)
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {PROBABILITIES.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label} ({p.score})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Impact</span>
          <select
            value={impact}
            onChange={(e) => setImpact(e.target.value as typeof impact)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {IMPACTS.map((i) => (
              <option key={i.v} value={i.v}>
                {i.label} ({i.score})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded border border-line-soft p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-secondary">
            Preview risk score (P × I):
          </span>
          <Badge tone={scoreTone(previewScore)}>{previewScore}</Badge>
        </div>
        <p className="text-[11px] text-ink-tertiary mt-1">
          DB recomputes this from `probability` × `impact` as a GENERATED
          STORED column — preview here is informational only.
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">Mitigation plan (optional)</span>
        <textarea
          value={mitigationPlan}
          onChange={(e) => setMitigationPlan(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
        Log risk
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

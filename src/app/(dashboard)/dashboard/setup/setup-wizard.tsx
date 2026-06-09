"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Home,
  Users,
  Check,
  ArrowLeft,
  ArrowRight,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  saveOnboardingProgressAction,
  finishOnboardingAction,
} from "@/features/keystone/actions";
import type { SetupCounts } from "@/features/keystone/services";

interface StepDef {
  n: 1 | 2 | 3;
  title: string;
  eyebrow: string;
  blurb: string;
  icon: React.ReactNode;
  createHref: string;
  createLabel: string;
  count: number;
}

export function SetupWizard({
  counts,
  initialStep,
}: {
  counts: SetupCounts;
  /** 0 = welcome screen; 1..3 = the matching wizard step. */
  initialStep: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Clamp into 0..3. 0 renders the welcome panel.
  const [step, setStep] = useState<number>(Math.min(Math.max(initialStep, 0), 3));

  const steps: StepDef[] = [
    {
      n: 1,
      title: "Add your villas",
      eyebrow: "Step 1 of 3",
      blurb:
        "Register the units you manage. Each villa carries its own calendar, rates, and owner share — the spine of everything downstream.",
      icon: <Home className="h-5 w-5" strokeWidth={1.75} />,
      createHref: "/dashboard/villas/new",
      createLabel: "Add a villa",
      count: counts.villas,
    },
    {
      n: 2,
      title: "Add your projects",
      eyebrow: "Step 2 of 3",
      blurb:
        "Group villas under a development or estate. Projects organise reporting, ownership, and handover milestones.",
      icon: <Building2 className="h-5 w-5" strokeWidth={1.75} />,
      createHref: "/dashboard/projects/new",
      createLabel: "Add a project",
      count: counts.projects,
    },
    {
      n: 3,
      title: "Invite your team",
      eyebrow: "Step 3 of 3",
      blurb:
        "Bring in the people who run day-to-day operations. Each teammate gets a role that scopes what they can see and do.",
      icon: <Users className="h-5 w-5" strokeWidth={1.75} />,
      createHref: "/dashboard/settings/team",
      createLabel: "Invite a teammate",
      count: counts.teamMembers,
    },
  ];

  const persist = (next: number) => {
    startTransition(async () => {
      await saveOnboardingProgressAction({ step: next });
    });
  };

  const goTo = (next: number) => {
    setStep(next);
    persist(next);
  };

  const finish = (mode: "complete" | "skip") => {
    startTransition(async () => {
      await finishOnboardingAction({ mode });
      router.push("/dashboard");
      router.refresh();
    });
  };

  // ---- Welcome screen (step 0) ----
  if (step === 0) {
    return (
      <div className="rounded-lg border border-line-soft bg-surface p-8 md:p-10">
        <Badge tone="gold">Welcome</Badge>
        <h2 className="text-display text-[28px] md:text-[34px] leading-tight font-medium text-ink mt-4">
          Let's set up your workspace
        </h2>
        <p className="text-ink-secondary mt-3 leading-relaxed max-w-2xl">
          Three quick steps and you're operational: register your villas,
          group them into projects, and invite the team. You can leave and
          come back any time — we'll remember where you stopped.
        </p>

        <ol className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-md border border-line-soft bg-canvas/40 p-5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-ink-secondary">
                  {s.icon}
                </span>
                <span className="text-xs uppercase tracking-widest text-ink-tertiary">
                  {s.eyebrow}
                </span>
              </div>
              <div className="mt-3 text-sm font-medium text-ink">{s.title}</div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={() => goTo(1)} disabled={pending}>
            Start setup
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => finish("skip")} disabled={pending}>
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  const current = steps[step - 1];
  const done = current.count > 0;

  return (
    <div className="flex flex-col gap-6">
      <StepRail steps={steps} active={step} onJump={goTo} disabled={pending} />

      <div className="rounded-lg border border-line-soft bg-surface p-8 md:p-10">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-ink-secondary">
            {current.icon}
          </span>
          <div className="flex-1">
            <span className="text-xs uppercase tracking-widest text-ink-tertiary">
              {current.eyebrow}
            </span>
            <h2 className="text-display text-[24px] md:text-[28px] leading-tight font-medium text-ink mt-1">
              {current.title}
            </h2>
            <p className="text-ink-secondary mt-2 leading-relaxed max-w-2xl">
              {current.blurb}
            </p>
          </div>
          {done ? (
            <Badge tone="success">
              {current.count} added
            </Badge>
          ) : (
            <Badge tone="warning">None yet</Badge>
          )}
        </div>

        <div className="mt-6 rounded-md border border-line-soft bg-canvas/40 p-5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-ink-secondary">
            {done
              ? `You have ${current.count} on record. Add more, or continue.`
              : "Nothing here yet — add your first one to continue."}
          </p>
          <Button asChild variant="secondary">
            <Link href={current.createHref}>
              <PlusCircle className="h-4 w-4" />
              {current.createLabel}
            </Link>
          </Button>
        </div>
      </div>

      {/* Back / Next / Finish */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => goTo(step - 1)}
          disabled={pending}
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 1 ? "Back to welcome" : "Back"}
        </Button>

        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => finish("skip")} disabled={pending}>
            Skip for now
          </Button>
          {step < 3 ? (
            <Button onClick={() => goTo(step + 1)} disabled={pending}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => finish("complete")} disabled={pending}>
              <Check className="h-4 w-4" />
              Finish setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepRail({
  steps,
  active,
  onJump,
  disabled,
}: {
  steps: StepDef[];
  active: number;
  onJump: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isActive = s.n === active;
        const isDone = s.count > 0;
        return (
          <li key={s.n} className="flex items-center gap-2 flex-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onJump(s.n)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
                isActive
                  ? "border-line-strong bg-canvas"
                  : "border-line-soft bg-surface hover:bg-muted/40",
                disabled && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  isDone
                    ? "bg-success/15 text-success"
                    : isActive
                      ? "bg-ink text-ink-inverse"
                      : "bg-muted text-ink-secondary",
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : s.n}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-widest text-ink-tertiary">
                  {s.eyebrow}
                </span>
                <span className="block truncate text-sm font-medium text-ink">
                  {s.title}
                </span>
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className="hidden md:block h-px w-4 bg-line-soft" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

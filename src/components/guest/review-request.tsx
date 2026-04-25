import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReviewRequest() {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="w-5 h-5 fill-gold text-gold"
              strokeWidth={1.5}
            />
          ))}
        </div>
        <span className="text-display text-[20px] leading-none font-medium text-ink tabular-nums">
          4.96
        </span>
      </div>
      <div className="flex-1">
        <span className="text-label">After your stay</span>
        <h3 className="text-display text-[22px] leading-tight font-medium text-ink mt-1">
          A short review goes a long way.
        </h3>
        <p className="text-sm text-ink-secondary mt-2 leading-relaxed">
          You'll receive a one-tap review prompt the morning of your checkout.
          Honest feedback helps the team — and lets future guests pick the
          right villa.
        </p>
      </div>
      <Button variant="secondary" className="shrink-0">
        Pre-arrange review reminder
      </Button>
    </div>
  );
}

import { ShieldCheck, Lock, Users } from "lucide-react";

export function PermissionBanner() {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-accent text-accent-contrast inline-flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div>
          <div className="text-sm font-medium text-ink">
            Permission-aware AI
          </div>
          <div className="text-xs text-ink-tertiary">
            Assistants run inside your auth context. They cannot read what you
            cannot read.
          </div>
        </div>
      </div>
      <div className="h-px md:h-8 md:w-px w-full bg-line-soft" />
      <div className="flex items-center gap-3">
        <Users className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
        <p className="text-xs text-ink-secondary">
          Investor data is never crossed between owners. Guest PII is never
          shared across stays.
        </p>
      </div>
      <div className="h-px md:h-8 md:w-px w-full bg-line-soft" />
      <div className="flex items-center gap-3">
        <Lock className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
        <p className="text-xs text-ink-secondary">
          Writes (payouts, access codes, PO sends) require explicit human
          approval.
        </p>
      </div>
    </div>
  );
}

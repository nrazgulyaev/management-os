"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookUp } from "lucide-react";
import { postFinanceToGlAction } from "@/lib/development/server/general-ledger/journal-actions";

/**
 * Triggers the idempotent auto-poster (revenue + expense sub-ledgers → GL
 * with the standard chart mapping) and reports how many entries it created.
 */
export function PostFinanceButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const res = await postFinanceToGlAction();
      if (res.error) {
        setMsg(`Error: ${res.error}`);
        return;
      }
      const posted = res.revenuePosted + res.expensePosted;
      setMsg(
        posted === 0
          ? `Up to date — nothing new (${res.reused} already posted).`
          : `Posted ${res.revenuePosted} revenue + ${res.expensePosted} expense (${res.reused} already posted).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} size="sm" disabled={pending}>
        <BookUp className="w-4 h-4" strokeWidth={1.75} />
        {pending ? "Posting…" : "Post finance to GL"}
      </Button>
      {msg && (
        <span className="text-[11px] text-ink-tertiary max-w-[260px] text-right">
          {msg}
        </span>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { PurchaseRequestMobileForm } from "@/components/development/procurement/purchase-request-mobile-form";

export const metadata: Metadata = {
  title: "New purchase request · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NewPurchaseRequestPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Supervisor · site</div>
            <h1>New purchase request</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projects = await safeQuery(
    "getDevelopmentProjects",
    getDevelopmentProjects(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/procurement/purchase-requests">
              Purchase requests
            </Link>
            <span>/</span>
            <span>New</span>
          </div>
          <h1>New purchase request</h1>
        </div>
        <div className="actions">
          <Link
            href="/development-os/procurement/purchase-requests"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All requests
          </Link>
        </div>
      </header>

      <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
        Mobile-friendly form for site supervisors. Touch targets ≥ 44px,
        single-column layout below 768px. Voice-to-text on the reason field uses
        your browser&rsquo;s native dictation if available.
      </p>

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          Form
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          What&rsquo;s needed
        </h2>
        <PurchaseRequestMobileForm
          projects={projects
            .filter((p) => p.realProjectId)
            .map((p) => ({
              id: p.realProjectId!,
              name: p.name,
              slug: p.slug,
            }))}
        />
      </div>
    </DevelopmentShell>
  );
}

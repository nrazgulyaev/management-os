import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { WaterfallSimulator } from "@/components/development/waterfall/waterfall-simulator";

export const metadata: Metadata = {
  title: "Waterfall simulator · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WaterfallSimulatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Waterfall simulator</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link>{" "}
            /{" "}
            <Link href={`/development-os/projects/${slug}/waterfall`}>
              Waterfall
            </Link>{" "}
            / <span>Simulator</span>
          </div>
          <h1>Waterfall simulator</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Try any rule + scenario; see the live allocation + reasoning
            markdown. Math runs entirely in the browser via the same pure
            helper used by the real distribution path — guaranteed identical
            output.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/waterfall`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Rules
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Scenario</div>
        <WaterfallSimulator />
      </div>
    </DevelopmentShell>
  );
}

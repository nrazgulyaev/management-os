import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { NewProjectClient } from "./_new-project-client";

export const metadata: Metadata = {
  title: "New project · Development OS",
};
export const dynamic = "force-dynamic";

/**
 * Create-project surface for the Command center "New project +" CTA.
 * Previously the link resolved to /development-os/projects/new which the
 * [slug] route swallowed into a notFound(). A static `new` segment wins
 * over the dynamic `[slug]`, so the CTA now lands here and opens the
 * working <NewProjectDrawer> (backed by `createDevelopmentProject`).
 */
export default function NewProjectPage() {
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/projects">Projects</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New project</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Stage 2.1 minimal create — seeds the projects row, development
            meta, and a land-sourcing phase scoped to your organization. The
            full setup wizard ships in 2.2.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/projects">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Projects
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <NewProjectClient />
        </Card>
      </div>
    </DevelopmentShell>
  );
}

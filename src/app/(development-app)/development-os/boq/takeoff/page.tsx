import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { TakeoffWorkbench } from "./_takeoff-workbench";

export const metadata: Metadata = { title: "Drawing takeoff · Development OS" };
export const dynamic = "force-dynamic";

/**
 * Estimator takeoff workbench — the сметчик's signature tool. Mounts the
 * existing DrawingViewer takeoff primitive (scale-calibrated on-drawing
 * area / length / count measurement, Bluebeam/CostX pattern) and turns
 * measured quantities into costed lines. This surface was entirely absent
 * — the BOQ cabinet shipped only read-only tables + import/export.
 */
export default function TakeoffPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        title="Drawing takeoff"
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/boq">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              BOQ
            </Link>
          </Button>
        }
      />
      <Section title="Measure a plan → cost the work">
        <p className="text-sm text-ink-secondary mb-4 max-w-2xl">
          Load a floor-plan or elevation, calibrate the scale once (pick two
          points a known distance apart and type the real distance), then draw
          area polygons, length polylines, or counts. Each measurement converts
          to a real quantity; type a unit rate to cost it. (Saving a takeoff
          line into the BOQ and an org rate library are the next step.)
        </p>
        <TakeoffWorkbench />
      </Section>
    </DevelopmentShell>
  );
}

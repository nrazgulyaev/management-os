import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { EditorialSection } from "@/components/marketing/editorial-section";
import { ProjectCard } from "@/components/marketing/project-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockProjects } from "@/lib/mock/projects";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

export const metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Portfolio"
        title="Three projects, one operating system."
        description="Eternal Villas, Enso Villas, and Ahau Gardens — each modelling a distinct ownership structure. All run on the same data core, the same design language, and the same trust model."
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">19 villas under management</Badge>
          <Badge tone="outline">57 bedrooms</Badge>
          <Badge tone="gold">Individual · Pooled · Hybrid</Badge>
        </div>
      </HeroSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {mockProjects.map((p) => (
              <div key={p.id} id={p.id} className="scroll-mt-28">
                <ScrollReveal>
                  <ProjectCard project={p} />
                </ScrollReveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      <EditorialSection
        eyebrow="Combined snapshot"
        title="A small, curated portfolio."
        description="Modelled metrics across the three projects in this preview. Real audited figures available under NDA."
        invert
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Villas under management", v: "19" },
            { l: "Bedrooms", v: "57" },
            { l: "Weighted occupancy YTD", v: "83.2%" },
            { l: "Average annualised yield", v: "10.8%" },
          ].map((k) => (
            <div
              key={k.l}
              className="rounded-md border border-line-soft bg-surface p-5 flex flex-col gap-2"
            >
              <span className="text-label">{k.l}</span>
              <span className="font-mono tabular-nums text-display text-[36px] leading-none text-ink mt-1">
                {k.v}
              </span>
            </div>
          ))}
        </div>
      </EditorialSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 text-center">
          <h2 className="text-display text-[30px] md:text-[44px] leading-[1.05] font-medium max-w-3xl mx-auto">
            Considering Arconique for your villa or pool?
          </h2>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Button asChild size="lg">
              <Link href="/contact">Request management proposal</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/case-studies">Read the case studies</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

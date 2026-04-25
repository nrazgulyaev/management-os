import Link from "next/link";
import { HeroSection } from "@/components/marketing/hero-section";
import { CaseStudyCard } from "@/components/marketing/case-study-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { caseStudies } from "@/lib/mock/case-studies";
import { ScrollStagger, ScrollStaggerItem } from "@/components/motion/scroll-reveal";

export const metadata = { title: "Case studies" };

export default function CaseStudiesPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Case studies"
        title="Modelled scenarios you can audit."
        description="Three projects, three management theses. Each card explains the model, the operations focus, and the investor reporting angle. Numbers are demo or modelled — full audited figures available under NDA."
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="gold">Modelled metrics</Badge>
          <Badge tone="outline">Demo data</Badge>
          <Badge tone="success">Audited figures available under NDA</Badge>
        </div>
      </HeroSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-16 md:py-24">
          <ScrollStagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {caseStudies.map((s) => (
              <div key={s.slug} id={s.slug} className="scroll-mt-28">
                <ScrollStaggerItem>
                  <CaseStudyCard study={s} />
                </ScrollStaggerItem>
              </div>
            ))}
          </ScrollStagger>
        </div>
      </section>

      <section className="border-b border-line-soft">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-20 text-center">
          <span className="text-label">A note on evidence</span>
          <h2 className="text-display text-[28px] md:text-[36px] leading-[1.1] font-medium text-ink mt-4">
            Case studies are drawn from the Arconique demo portfolio. Where
            performance figures appear they are clearly marked as modelled or
            illustrative. Audited results are available under NDA on request.
          </h2>
          <div className="mt-8">
            <Button asChild>
              <Link href="/contact">Request audited figures</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

import { HeroSection } from "@/components/marketing/hero-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, MapPin, Mail } from "lucide-react";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <HeroSection
        kind="pillar"
        eyebrow="Contact & apply"
        title="Bring us your villa."
        description="We manage a small, curated portfolio of premium villas in Bali. If you're considering management, renovation, or an investment conversation — tell us briefly below and we'll be in touch within two business days."
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">Reply within 2 business days</Badge>
          <Badge tone="outline">Onboarding cohorts open quarterly</Badge>
        </div>
      </HeroSection>

      <section className="border-b border-line-soft">
        <div className="max-w-[1200px] mx-auto px-6 md:px-8 py-16 md:py-20 grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <form
              className="flex flex-col gap-6 rounded-lg border border-line-soft bg-surface p-6 md:p-10"
              action="/api/contact"
              method="post"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Full name" name="name" required />
                <Field label="Email" name="email" type="email" required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Phone (optional)" name="phone" />
                <Field label="Country of residence" name="country" />
              </div>
              <SelectField
                label="What best describes your interest?"
                name="interest"
                options={[
                  { value: "management", label: "I own a villa in Bali and want it managed" },
                  { value: "investor", label: "I'd like to invest in a villa or pool" },
                  { value: "development", label: "I'm considering a development with Arconique" },
                  { value: "broker", label: "I'm a broker / partner exploring co-management" },
                  { value: "other", label: "Something else" },
                ]}
              />
              <Field label="Villa location / project (if relevant)" name="villa" />
              <TextArea
                label="Tell us briefly"
                name="notes"
                placeholder="Your villa, your timeline, and anything we should know. A few sentences is plenty."
              />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-line-soft pt-5">
                <p className="text-xs text-ink-tertiary max-w-sm">
                  By submitting you agree to Arconique contacting you about
                  this inquiry. We do not share your details with third
                  parties.
                </p>
                <Button type="submit" size="lg">
                  Send inquiry
                </Button>
              </div>
            </form>
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-lg border border-line-soft bg-surface p-6 flex flex-col gap-4">
              <span className="text-label">What happens next</span>
              <ul className="flex flex-col gap-3">
                {[
                  "We acknowledge your message within one business day.",
                  "A short discovery call to understand your villa and goals.",
                  "If we're a fit, we share a tailored management proposal.",
                  "Onboarding scheduled in the next quarterly cohort.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm text-ink-secondary leading-relaxed">
                    <CheckCircle2
                      className="w-4 h-4 text-success mt-0.5 shrink-0"
                      strokeWidth={1.75}
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-line-soft bg-surface p-6 flex flex-col gap-4">
              <span className="text-label">Direct contact</span>
              <a
                href="mailto:hello@arconique.com"
                className="flex items-center gap-3 text-sm text-ink hover:text-accent transition-colors"
              >
                <Mail
                  className="w-4 h-4 text-ink-tertiary"
                  strokeWidth={1.75}
                />
                hello@arconique.com
              </a>
              <div className="flex items-center gap-3 text-sm text-ink-secondary">
                <MapPin
                  className="w-4 h-4 text-ink-tertiary"
                  strokeWidth={1.75}
                />
                Berawa, Bali · Indonesia
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-label">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong transition-colors"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-label">{label}</span>
      <textarea
        name={name}
        rows={5}
        placeholder={placeholder}
        className="px-3 py-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-line-strong transition-colors resize-none"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-label">{label}</span>
      <select
        name={name}
        defaultValue=""
        className="h-11 px-3 rounded-sm border border-line-soft bg-canvas text-sm text-ink focus:outline-none focus:border-line-strong transition-colors"
      >
        <option value="" disabled>
          Select one
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

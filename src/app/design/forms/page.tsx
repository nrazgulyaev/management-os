import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * foundations/01 PR2.1 — form-primitive demo / §6 visual-verify page.
 *
 * Reproduces the canonical mockup `FormSection` from
 * design-handoff/design-system.html (lines 2884–2982) for both product
 * palettes (mgmt terra focus, dev amber focus). Each group sits inside a
 * `.ds-preview`-style cream panel (`bg-cream` = --cream #F4EFE6) so the
 * near-white `--paper` inputs read lighter than the panel and their --line
 * border shows — exactly as the mockup frames them. Page backdrop is dark
 * (`bg-ink`) so the cream panels read as light islands, like the mockup's
 * doc chrome. Token-only utilities, no `style={{}}`, no token/forms.css
 * changes. Public + no auth → renders on a preview deploy without the
 * `?product=` override. Remove after review.
 */
export const metadata = { title: "Form primitives" };
export const dynamic = "force-static";

/** `.ds-preview`-style cream panel framing the controls (mockup parity). */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream rounded-[14px] p-7 border border-line">
      {children}
    </div>
  );
}

/** Mockup `Sub`: a titled (+ optional desc) block above a cream Panel. */
function Sub({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-cream-warm/80">{title}</h3>
      {desc && <p className="text-xs text-cream-warm/50 max-w-md">{desc}</p>}
      <Panel>{children}</Panel>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20 L16.5 16.5" />
    </svg>
  );
}

type Product = "management" | "development";

/** Full mockup FormSection for one product. */
function FormSection({ product }: { product: Product }) {
  const notes =
    product === "development"
      ? "Site supervisor notes — concrete pour delayed 4 h due to rain."
      : "Concierge briefing — VIP arrival, requested orchid in-room.";

  return (
    <section data-product={product} className="flex flex-col gap-8">
      <h2 className="text-base font-semibold text-cream-warm">
        {product === "development"
          ? "Development — amber focus"
          : "Management — terra focus"}
      </h2>

      <Sub title="Text input / Select / Textarea">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
          <Field
            label="Guest name"
            help="Searches across all stays."
            htmlFor={`gn-${product}`}
          >
            <Input
              id={`gn-${product}`}
              placeholder="Type a name…"
              autoFocus={product === "management"}
            />
          </Field>
          <Field label="Channel" htmlFor={`ch-${product}`}>
            <Select id={`ch-${product}`} defaultValue="direct">
              <option value="direct">Direct</option>
              <option value="airbnb">Airbnb</option>
              <option value="booking">Booking.com</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor={`nt-${product}`} className="sm:col-span-2">
            <Textarea id={`nt-${product}`} placeholder={notes} />
          </Field>
          <Field label="Arrival" htmlFor={`ar-${product}`}>
            <Input id={`ar-${product}`} type="date" defaultValue="2026-03-14" />
          </Field>
          <Field
            label="Net to owner (IDR M)"
            error="Must match statement total within 0.5 %."
            htmlFor={`nto-${product}`}
          >
            <Input id={`nto-${product}`} className="mono" defaultValue="28.4" />
          </Field>
        </div>
      </Sub>

      <Sub title="Checkbox / Radio / Toggle">
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-wrap gap-[18px]">
            <Checkbox label="Send statement to owner" defaultChecked />
            <Checkbox label="Include guest-services line items" />
          </div>
          <div className="flex flex-wrap gap-[18px]">
            <label className="check radio">
              <input type="radio" name={`r-${product}`} defaultChecked />
              <span className="box" aria-hidden />
              Auto-send on the 5th
            </label>
            <label className="check radio">
              <input type="radio" name={`r-${product}`} />
              <span className="box" aria-hidden />
              Hold for sign-off
            </label>
            <label className="check radio">
              <input type="radio" name={`r-${product}`} />
              <span className="box" aria-hidden />
              Draft only
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13.5px] text-ink">Notifications</span>
            <span className="toggle on" />
            <span className="text-[12px] text-ink-3">push enabled</span>
          </div>
        </div>
      </Sub>

      <Sub
        title="Search input"
        desc="Pill-shape, mono ⌘K hint inline. Also lives in the topbar."
      >
        <div className="topbar-search w-full max-w-[360px]">
          <span className="sx" aria-hidden>
            <SearchIcon />
          </span>
          <input
            className="pr-12!"
            placeholder="Search villa, booking, owner, guest…"
          />
          <span className="kbd absolute right-[8px] top-1/2 -translate-y-1/2">
            ⌘K
          </span>
        </div>
      </Sub>
    </section>
  );
}

export default function FormPrimitivesPage() {
  return (
    <main className="min-h-screen bg-ink text-cream-warm p-8 md:p-12 flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-cream-warm/50">
          foundations / 01 · PR2.1 — form primitives
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-cream-warm">
          Form controls
        </h1>
        <p className="text-sm text-cream-warm/60 max-w-2xl">
          One paired family of inputs for both products. Focus ring uses
          var(--accent) at 18 % opacity; the label is the mono-caps eyebrow
          above each field. Panel is --cream; inputs are --paper (lighter), so
          the --line border reads as in the mockup.
        </p>
      </header>

      <FormSection product="management" />
      <FormSection product="development" />
    </main>
  );
}

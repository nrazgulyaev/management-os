import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * foundations/01 PR2 — form-primitive demo / visual-verify page. Renders the
 * primitives under both `data-product` palettes (mgmt terra focus, dev amber
 * focus) so they can be diffed against chrome.css. Public + no auth → works on
 * a preview deploy without the `?product=` override. Remove after review.
 */
export const metadata = { title: "Form primitives" };
export const dynamic = "force-static";

function FormSet() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <Field label="Work email" help="We'll never share it." htmlFor="e">
        <Input id="e" type="email" placeholder="you@company.com" />
      </Field>
      <Field label="Role" htmlFor="r">
        <Select id="r" defaultValue="">
          <option value="" disabled>
            Choose a role…
          </option>
          <option>Operator</option>
          <option>Owner</option>
          <option>Investor</option>
        </Select>
      </Field>
      <Field label="Notes" error="This field is required." htmlFor="n">
        <Textarea id="n" placeholder="Add context…" />
      </Field>
      <Checkbox label="Keep me signed in on this device" defaultChecked />
    </div>
  );
}

export default function FormPrimitivesPage() {
  return (
    <div className="min-h-screen bg-cream p-8 md:p-12 flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <span className="text-label">foundations / 01 · PR2</span>
        <h1 className="text-display text-3xl text-ink">Form primitives</h1>
      </header>

      <section data-product="management" className="flex flex-col gap-4">
        <h2 className="display-sm">Management — terra focus</h2>
        <FormSet />
      </section>

      <section data-product="development" className="flex flex-col gap-4">
        <h2 className="display-sm">Development — amber focus</h2>
        <FormSet />
      </section>
    </div>
  );
}

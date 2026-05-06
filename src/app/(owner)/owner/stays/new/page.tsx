import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { listOwnerPortalChoicesForCurrentUser } from "@/features/owner-stays/services";
import { OwnerStayRequestForm } from "@/components/owner-stays/owner-request-form";

export const metadata = { title: "Request a stay" };
export const dynamic = "force-dynamic";

export default async function NewOwnerStayPage() {
  const choices = await listOwnerPortalChoicesForCurrentUser();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner portal", href: "/owner" },
          { label: "Stays", href: "/owner/stays" },
          { label: "New" },
        ]}
        title="Request an owner stay"
        description="Owner stays are welcome. Operational costs and rental-pool compensation may apply depending on your policy and selected dates."
      />

      {choices.length === 0 ? (
        <Section eyebrow="Heads up" title="No villas available">
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            We couldn't find any villas linked to your account. Please contact
            your property manager to confirm your portfolio.
          </p>
        </Section>
      ) : (
        <OwnerStayRequestForm choices={choices} />
      )}
    </div>
  );
}

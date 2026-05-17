import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { listOwnerPortalChoicesForCurrentUser } from "@/features/owner-stays/services";
import { OwnerStayRequestForm } from "@/components/owner-stays/owner-request-form";

export const metadata = { title: "Request a stay" };
export const dynamic = "force-dynamic";

export default async function NewOwnerStayPage() {
  const choices = await listOwnerPortalChoicesForCurrentUser();
  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Portfolio · stays · new"
        title="Request an owner stay"
        subtitle="Owner stays are welcome. Operational costs and rental-pool compensation may apply depending on your policy and selected dates."
      />

      {choices.length === 0 ? (
        <Card style={{ padding: 24 }}>
          <div className="label">Heads up</div>
          <h2 className="display" style={{ fontSize: 20, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
            No villas available
          </h2>
          <p style={{ fontSize: 14, color: "var(--ink-3)", margin: 0 }}>
            We couldn&apos;t find any villas linked to your account. Please contact
            your property manager to confirm your portfolio.
          </p>
        </Card>
      ) : (
        <OwnerStayRequestForm choices={choices} />
      )}
    </div>
  );
}

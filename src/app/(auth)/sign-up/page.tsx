import { redirect } from "next/navigation";

/**
 * Legacy signup surface — superseded by the public `/signup` flow
 * (`features/signup/actions.ts`), which signs the user in and lands them
 * on their workspace. This older page posted to `/api/onboarding/start`,
 * which deliberately set no session and bounced to `/login` — a worse
 * funnel. Nothing user-facing links here anymore; we keep the route as a
 * redirect so any stale bookmark / warm-route hit reaches the canonical
 * flow.
 */
export const dynamic = "force-dynamic";

export default async function LegacySignUpRedirect({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const sp = await searchParams;
  const qs = sp.product ? `?product=${encodeURIComponent(sp.product)}` : "";
  redirect(`/signup${qs}`);
}

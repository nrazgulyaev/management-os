import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { MotionLayer } from "@/components/motion-layer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
      {/* Scroll-reveal / parallax / count-up engine — scoped to the public
          marketing surfaces (moved out of the global root layout so it no
          longer taxes dashboard renders). */}
      <MotionLayer />
    </>
  );
}

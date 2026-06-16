import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { MotionLayerLazy } from "@/components/motion-layer-lazy";

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
          longer taxes dashboard renders). Lazy-loaded (ssr:false) so it
          doesn't block first paint. */}
      <MotionLayerLazy />
    </>
  );
}

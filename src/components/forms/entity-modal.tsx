"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stage 6.P0 — generic modal shell using the HTML5 <dialog> element.
 *
 * Design:
 * - Native <dialog>.showModal() gives free focus-trap, Escape-to-close,
 *   and a focus-restoration story that's better than any handrolled
 *   overlay. No external dep (no Radix / Headless UI).
 * - "use client" because we need useRef + useEffect to drive the
 *   imperative dialog API.
 * - Mobile-responsive via Tailwind: full-screen on small screens with
 *   safe scroll, centered card on md+.
 *
 * Pattern (call site):
 *
 *   const [open, setOpen] = useState(false);
 *   <Button onClick={() => setOpen(true)}>Edit</Button>
 *   <EntityModal open={open} onClose={() => setOpen(false)} title="Edit project">
 *     <ProjectForm mode="edit" defaults={p} />
 *   </EntityModal>
 *
 * The form's <SubmitButton> + redirect/revalidate flow handles the
 * post-submit close automatically (server action redirects → router
 * pulls fresh data → client unmounts the modal naturally).
 */
export function EntityModal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  hideHeader = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideHeader?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Drive showModal() / close() from the `open` prop.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  // The native <dialog> "close" event fires for Escape AND for explicit
  // .close() calls. Bridge it to onClose so React state stays in sync.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handler = () => onClose();
    dlg.addEventListener("close", handler);
    return () => dlg.removeEventListener("close", handler);
  }, [onClose]);

  // Backdrop click closes (native <dialog> doesn't do this for free).
  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onClose();
  }

  const widthCls = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      className={cn(
        // layout
        "p-0 rounded-3xl bg-canvas border border-line-soft shadow-xl",
        "w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] overflow-hidden",
        widthCls,
        // override default <dialog> centering for mobile-friendliness
        "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        // backdrop
        "backdrop:bg-ink/40 backdrop:backdrop-blur-sm",
      )}
      // Prevent the click-on-content from triggering the backdrop close.
      data-testid="entity-modal"
    >
      <div className="flex flex-col max-h-[calc(100vh-4rem)]">
        {!hideHeader && (title || description) && (
          <header className="flex items-start justify-between gap-4 px-5 md:px-6 pt-5 pb-4 border-b border-line-soft shrink-0">
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-medium text-ink truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-ink-secondary mt-1">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -m-1.5 rounded-sm text-ink-tertiary hover:text-ink hover:bg-muted transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </header>
        )}
        <div className="overflow-y-auto px-1 md:px-2 py-1">{children}</div>
      </div>
    </dialog>
  );
}

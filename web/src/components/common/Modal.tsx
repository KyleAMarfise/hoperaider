import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// Thin wrapper over the native <dialog> so we keep the existing .sched-add-dialog
// CSS (incl. ::backdrop). Children mount only while open so forms re-init cleanly.
export function Modal({
  open,
  onClose,
  className = "",
  children
}: {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";

export function ActionButton({
  action,
  children,
  className = "button",
  loadingText = "Loading...",
  successText = "Action completed",
  errorText = "Action failed"
}: {
  action: () => Promise<any>;
  children: React.ReactNode;
  className?: string;
  loadingText?: string;
  successText?: string;
  errorText?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className={className}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await action();
            toast.success(successText);
          } catch (e: any) {
            toast.error(e.message || errorText);
          }
        });
      }}
      style={{ opacity: isPending ? 0.7 : 1, cursor: isPending ? "not-allowed" : "pointer" }}
    >
      {isPending ? loadingText : children}
    </button>
  );
}

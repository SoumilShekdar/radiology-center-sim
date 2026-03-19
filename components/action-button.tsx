"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import Button, { ButtonProps } from "@mui/material/Button";

type ActionButtonProps = ButtonProps & {
  serverAction: () => Promise<unknown>;
  loadingText?: string;
  successText?: string;
  errorText?: string;
};

export function ActionButton({
  serverAction,
  children,
  loadingText = "Loading...",
  successText = "Action completed",
  errorText = "Action failed",
  ...buttonProps
}: ActionButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      {...buttonProps}
      disabled={isPending || buttonProps.disabled}
      onClick={(e) => {
        if (buttonProps.onClick) buttonProps.onClick(e);
        startTransition(async () => {
          try {
            await serverAction();
            toast.success(successText);
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : errorText;
            toast.error(errorMessage);
          }
        });
      }}
    >
      {isPending ? loadingText : children}
    </Button>
  );
}

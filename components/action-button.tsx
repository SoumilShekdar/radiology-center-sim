"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import Button, { ButtonProps } from "@mui/material/Button";

type ActionButtonProps = ButtonProps & {
  serverAction: () => Promise<any>;
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
          } catch (e: any) {
            toast.error(e.message || errorText);
          }
        });
      }}
    >
      {isPending ? loadingText : children}
    </Button>
  );
}

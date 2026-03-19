"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Props = {
  active: boolean;
  intervalMs?: number;
};

export function RunStatusPoller({ active, intervalMs = 2500 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }

    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [active, intervalMs, router]);

  return null;
}

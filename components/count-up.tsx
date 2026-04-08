"use client";

import { useEffect } from "react";
import { useMotionValue, useSpring, useTransform, motion } from "framer-motion";
import { formatCurrency } from "@/lib/currency";

type Props = {
  value: number;
  formatType?: "number" | "currency" | "minutes" | "percent";
  currencyCode?: string;
};

export function CountUpNumber({ value, formatType = "number", currencyCode = "USD" }: Props) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 150,
  });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  const display = useTransform(springValue, (current) => {
    if (formatType === "currency") {
      return formatCurrency(current, currencyCode);
    }
    if (formatType === "minutes") {
      return `${Math.round(current)} min`;
    }
    if (formatType === "percent") {
      return `${Math.round(current)}%`;
    }
    return Math.round(current).toString();
  });

  return <motion.span>{display}</motion.span>;
}

export const SUPPORTED_CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED", "SGD"] as const;

export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

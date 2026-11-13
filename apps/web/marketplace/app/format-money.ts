export function formatMoney(
  amount: string | null,
  currency: string | null,
  locale?: string,
): string | null {
  if (amount === null || currency === null) return null;

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return null;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(numericAmount);
  } catch {
    return null;
  }
}

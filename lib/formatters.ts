/**
 * Formatting utilities for Fantasi Coffee POS
 */

/**
 * Format number into Indonesian Rupiah currency format
 * e.g. 24000 -> "Rp 24.000" (or locale equivalent)
 */
export function formatRupiah(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "Rp 0";
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format stock quantity with its unit
 * e.g. (2500, 'gram') -> "2.500 gram"
 */
export function formatStock(quantity: number, unit: string): string {
  const formattedNumber = new Intl.NumberFormat("id-ID").format(quantity);
  return `${formattedNumber} ${unit}`;
}

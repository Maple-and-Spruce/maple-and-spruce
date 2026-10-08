/** Format a cents value as "$12.34" for display. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

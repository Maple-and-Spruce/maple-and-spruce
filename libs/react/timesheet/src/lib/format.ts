export function formatHours(hours: number): string {
  return `${hours.toFixed(2)} hr${hours === 1 ? '' : 's'}`;
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/** Today's date in local timezone, formatted as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Formats a number as GBP, e.g. 4.5 → "£4.50". Always two decimal places.
export function formatGBP(amount) {
  return '£' + Number(amount).toFixed(2)
}

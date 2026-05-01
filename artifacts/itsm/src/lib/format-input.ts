// Shared on-blur normalizers for free-text money / percent inputs.
//
// Both helpers are intentionally lenient: if the user typed a single
// scalar value we reformat it so the field reads as currency or a
// percentage, but ranges and other free text ("$50K-$100K", "10–15%",
// "TBD") are returned verbatim so estimates aren't destroyed.

function parseScalar(input: string): number | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  let cleaned = s.replace(/[\s,$]/g, "");
  let multiplier = 1;
  if (/[kK]$/.test(cleaned)) {
    multiplier = 1_000;
    cleaned = cleaned.slice(0, -1);
  } else if (/[mM]$/.test(cleaned)) {
    multiplier = 1_000_000;
    cleaned = cleaned.slice(0, -1);
  } else if (/[bB]$/.test(cleaned)) {
    multiplier = 1_000_000_000;
    cleaned = cleaned.slice(0, -1);
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n * multiplier;
}

// True when the input contains a separator that suggests a range or
// list (e.g. "$50K-$100K", "10 to 15%", "1/2"). When detected we leave
// the value untouched so authors can keep typing free-text estimates.
function looksLikeRange(input: string): boolean {
  if (/[–—\/]|\bto\b/i.test(input)) return true;
  // Hyphen used as a separator (anywhere except a leading sign).
  const stripped = input.replace(/[\s,$]/g, "").replace(/^-/, "");
  return /-/.test(stripped);
}

// Drops trailing zeros on the fractional part: 25.00 → "25", 25.50 → "25.5".
function trimFractional(n: number, maxFractionDigits: number): string {
  const fixed = n.toFixed(maxFractionDigits);
  if (fixed.includes(".")) return fixed.replace(/\.?0+$/, "");
  return fixed;
}

/** Format a money input on blur: "100" → "$100.00"; ranges left alone. */
export function formatMoneyOnBlur(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return s;
  if (looksLikeRange(s)) return s;
  const n = parseScalar(s);
  if (n == null) return s;
  try {
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/**
 * Format a percent input on blur. Single scalars become "X%". Values
 * between 0 and 1 are treated as fraction-form (e.g. "0.25" → "25%")
 * to match how authors think about exposure factors / rates. Ranges and
 * unparseable text are returned untouched.
 */
export function formatPercentOnBlur(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return s;
  if (looksLikeRange(s)) return s;
  // Already suffixed with %? Just clean it up.
  const pctMatch = s.match(/^([+-]?\d*\.?\d+)\s*%$/);
  if (pctMatch) {
    const n = Number(pctMatch[1]);
    if (!Number.isFinite(n)) return s;
    return `${trimFractional(n, 4)}%`;
  }
  const n = parseScalar(s);
  if (n == null) return s;
  // 0 < n <= 1 (or n == 0) → assume fraction form like "0.25" → "25%".
  // n > 1 → assume bare percent like "25" → "25%".
  if (n >= 0 && n <= 1) {
    return `${trimFractional(n * 100, 4)}%`;
  }
  return `${trimFractional(n, 4)}%`;
}

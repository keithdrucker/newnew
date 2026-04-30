import { useMemo } from "react";

// Lightweight dirty-state hook used by editor dialogs (Initiatives,
// Projects, etc.) so they can detect when a user has staged any
// edits — to a field, the description, the checklist, or any other
// editable metadata — and prompt before discarding.
//
// We compare via stable JSON serialization. The editable surfaces in
// these dialogs are bounded (handful of strings, numbers, enums,
// nullable dates, and a small checklist array), so a JSON compare is
// cheap and correct without forcing every call site to write a
// custom equality function. Order of object keys is preserved by
// JSON.stringify in V8/JSC for own enumerable string keys, and the
// callers always build `current` and `baseline` with the same shape,
// so this is stable in practice.
export function useIsDirty<T>(current: T, baseline: T): boolean {
  return useMemo(() => {
    try {
      return JSON.stringify(current) !== JSON.stringify(baseline);
    } catch {
      // Fall back to "dirty" if a value can't be serialized — better
      // to over-prompt than to silently lose work.
      return true;
    }
  }, [current, baseline]);
}

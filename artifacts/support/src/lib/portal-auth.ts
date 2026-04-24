const STORAGE_KEY = "harmony-support-end-user-id";

export function getStoredEndUserId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    if (Number.isNaN(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

export function setStoredEndUserId(id: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

export function clearStoredEndUserId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

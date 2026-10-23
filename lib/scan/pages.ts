import "server-only";
import { getSetting, setSetting } from "@/lib/db";
import { PAGES_DEFAULT, clampPages } from "@/lib/scrapers/pages";

const KEY = "scan:pages";

export function getScanPages(): number {
  const raw = getSetting(KEY);
  return raw === null || raw === undefined ? PAGES_DEFAULT : clampPages(raw);
}

export function setScanPages(n: number): number {
  const v = clampPages(n);
  setSetting(KEY, String(v));
  return v;
}

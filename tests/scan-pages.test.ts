import { describe, expect, it } from "vitest";
import { PAGES_DEFAULT, PAGES_MAX, PAGES_MIN, capOf, clampPages, pagesOf } from "@/lib/scrapers/pages";

describe("profondeur de recherche", () => {
  it("borne le réglage et retombe sur la valeur par défaut", () => {
    expect(clampPages(0)).toBe(PAGES_MIN);
    expect(clampPages(99)).toBe(PAGES_MAX);
    expect(clampPages(4.7)).toBe(4);
    for (const bad of ["abc", undefined, NaN]) expect(clampPages(bad)).toBe(PAGES_DEFAULT);
    expect(pagesOf({})).toBe(PAGES_DEFAULT);
    expect(pagesOf({ pages: 2 })).toBe(2);
  });
  it("le plafond d'offres suit la profondeur ; maxOffres explicite l'emporte", () => {
    expect(capOf({ pages: 3 }, 50)).toBe(50);
    expect(capOf({ pages: 6 }, 50)).toBe(100);
    expect(capOf({ pages: 1 }, 50)).toBe(17);
    expect(capOf({ pages: 10 }, 50)).toBeGreaterThan(capOf({ pages: 5 }, 50));
    expect(capOf({ pages: 10, maxOffres: 7 }, 50)).toBe(7);
  });
});

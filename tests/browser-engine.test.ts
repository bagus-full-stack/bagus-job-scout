import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasCompleteChromium } from "@/lib/scrapers/browser-engine";

/** Régression : un autre numéro de révision (1248) ne doit pas passer pour le moteur exigé (1217). */
describe("hasCompleteChromium", () => {
  const mk = (...dirs: string[]) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "engine-"));
    for (const d of dirs) {
      fs.mkdirSync(path.join(root, d), { recursive: true });
      fs.writeFileSync(path.join(root, d, "INSTALLATION_COMPLETE"), "");
    }
    return root;
  };

  it("refuse une autre révision", () => {
    expect(hasCompleteChromium(mk("chromium_headless_shell-1248"), "1217")).toBe(false);
  });
  it("accepte la révision exigée", () => {
    expect(hasCompleteChromium(mk("chromium_headless_shell-1217"), "1217")).toBe(true);
  });
  it("refuse un dossier sans INSTALLATION_COMPLETE", () => {
    const root = mk();
    fs.mkdirSync(path.join(root, "chromium_headless_shell-1217"));
    expect(hasCompleteChromium(root, "1217")).toBe(false);
  });
  it("sans révision connue : tout chromium* complet est accepté", () => {
    expect(hasCompleteChromium(mk("chromium-1248"), null)).toBe(true);
  });
});

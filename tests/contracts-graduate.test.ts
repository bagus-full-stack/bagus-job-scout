import { describe, expect, it } from "vitest";
import { classifyContract, CONTRACT_LABELS, CONTRACT_ORDER } from "@/lib/contracts";
import { scoreOffreLocal } from "@/lib/scoring/local";
import { profile } from "./fixtures";

const c = (title: string, description_text = "", contract_type: string | null = null) =>
  classifyContract({ contract_type, title, description_text });

describe("catégorie « Graduate program »", () => {
  it("est proposée dans les filtres, avec son libellé", () => {
    expect(CONTRACT_ORDER).toContain("graduate");
    expect(CONTRACT_LABELS.graduate).toBe("Graduate program");
  });
  it("reconnaît les variantes d'intitulé", () => {
    for (const t of [
      "Software Engineer – Graduate Program",
      "2026 Graduate Programme, Technology",
      "Graduate Scheme Engineer",
      "Graduate Trainee Developer",
      "New Grad Software Engineer",
      "Early Careers Programme – Data",
      "Programme Jeunes Diplômés – Ingénieur logiciel",
    ])
      expect(c(t), t).toBe("graduate");
  });
  it("reconnaît le programme annoncé en tête de description", () => {
    expect(c("Ingénieur logiciel", "Rejoignez notre graduate program de 18 mois.")).toBe("graduate");
  });
  it("ne prend pas une simple mention tardive pour un graduate program", () => {
    expect(c("Développeur Java CDI", `${"x ".repeat(300)}Nous avons aussi un graduate program.`)).not.toBe("graduate");
    expect(c("Développeur Java", "CDI. Bac+5 graduate requis.")).toBe("cdi");
  });
  it("laisse stage, alternance et V.I.E à leur catégorie", () => {
    expect(c("Stage développeur")).toBe("stage");
    expect(c("Alternance développeur")).toBe("alternance");
  });
});

describe("score du contrat", () => {
  it("un graduate program convient à qui cherche un CDI, pas à qui ne cherche que des stages", () => {
    const o = { title: "Graduate Program Engineer", description_text: "Engineer", contract_type: null };
    expect(scoreOffreLocal({ ...profile, preferred_contracts: ["cdi"] } as never, o as never).breakdown.contract).toBe(100);
    expect(scoreOffreLocal({ ...profile, preferred_contracts: ["stage"] } as never, o as never).breakdown.contract).toBe(20);
    expect(scoreOffreLocal({ ...profile, preferred_contracts: ["graduate"] } as never, o as never).breakdown.contract).toBe(100);
  });
});

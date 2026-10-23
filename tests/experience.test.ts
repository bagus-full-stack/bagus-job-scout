import { describe, expect, it } from "vitest";
import { experienceLabel, experienceMatches, extractExperience } from "@/lib/experience";

const x = (text: string, title = "Développeur") => extractExperience(title, text);

describe("expérience demandée", () => {
  it("lit une tranche", () => {
    expect(x("Vous justifiez de 2 à 5 ans d'expérience en Java.")).toEqual({ min: 2, max: 5 });
    expect(x("Profil : 3-5 ans d’expérience")).toEqual({ min: 3, max: 5 });
    expect(x("2 to 4 years of experience with React")).toEqual({ min: 2, max: 4 });
  });
  it("lit un minimum", () => {
    expect(x("Une expérience de 3 ans minimum est requise.")).toEqual({ min: 3, max: null });
    expect(x("Au moins 5 ans d'expérience")).toEqual({ min: 5, max: null });
    expect(x("5+ years of experience in Python")).toEqual({ min: 5, max: null });
    expect(x("Expérience : 2 ans et plus")).toEqual({ min: 2, max: null });
  });
  it("ignore les « ans » qui ne parlent pas d'expérience", () => {
    expect(x("Depuis 20 ans, notre entreprise est leader. Rejoignez-nous.")).toBeNull();
    expect(x("Nous avons 15 ans d'existence et 3 sites.")).toBeNull();
  });
  it("reconnaît le débutant et le senior sans chiffre", () => {
    expect(x("Débutant accepté, formation assurée.")).toEqual({ min: 0, max: 1 });
    expect(x("Poste ouvert aux jeunes diplômés.")).toEqual({ min: 0, max: 1 });
    expect(x("Mission variée.", "Développeur Junior")).toEqual({ min: 0, max: 2 });
    expect(x("Mission variée.", "Senior Software Engineer")).toEqual({ min: 5, max: null });
    expect(x("Mission variée.")).toBeNull();
  });
  it("une mention chiffrée l'emporte sur le titre", () => {
    expect(x("2 ans d'expérience minimum", "Senior Developer")).toEqual({ min: 2, max: null });
  });
  it("filtre par fourchette qui chevauche la vôtre", () => {
    expect(experienceMatches({ min: 0, max: 2 }, 0, 3)).toBe(true);
    expect(experienceMatches({ min: 3, max: 5 }, 0, 3)).toBe(true);
    expect(experienceMatches({ min: 2, max: null }, 0, 3)).toBe(true);
    expect(experienceMatches({ min: 5, max: null }, 0, 3)).toBe(false);
    expect(experienceMatches({ min: 0, max: 2 }, 3, 6)).toBe(false);
    expect(experienceMatches({ min: 1, max: null }, 3, 6)).toBe(true);
  });
  it("formate l'exigence", () => {
    expect(experienceLabel({ min: 2, max: 5 })).toBe("2 à 5 ans");
    expect(experienceLabel({ min: 3, max: null })).toBe("3 ans et plus");
    expect(experienceLabel({ min: 0, max: null })).toBe("Débutant accepté");
    expect(experienceLabel({ min: 1, max: 1 })).toBe("1 an");
  });
});

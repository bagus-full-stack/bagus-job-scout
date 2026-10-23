import { describe, expect, it } from "vitest";
import { getSetting, setSetting } from "@/lib/db";
import { decryptSecret, encryptSecret, getMailConfig, saveMailConfig } from "@/lib/mail/send";

describe("mot de passe SMTP chiffré", () => {
  it("chiffre puis déchiffre, sans rien laisser en clair", () => {
    const enc = encryptSecret("mot-de-passe-app");
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain("mot-de-passe-app");
    expect(decryptSecret(enc)).toBe("mot-de-passe-app");
  });
  it("refuse une valeur altérée", () => {
    const enc = encryptSecret("abc");
    expect(decryptSecret(enc.slice(0, -2) + "AA")).toBeNull();
  });
  it("saveMailConfig stocke chiffré, getMailConfig rend le clair", () => {
    saveMailConfig({ host: "smtp.x.fr", port: 465, user: "a@x.fr", pass: "secret1", fromName: "" });
    expect(getSetting("mail:pass")).toMatch(/^enc:v1:/);
    expect(getMailConfig()?.pass).toBe("secret1");
  });
  it("migre un ancien mot de passe en clair à la première lecture", () => {
    setSetting("mail:pass", "ancien-clair");
    expect(getMailConfig()?.pass).toBe("ancien-clair");
    expect(getSetting("mail:pass")).toMatch(/^enc:v1:/);
  });
});

import { describe, expect, it } from "vitest";
import { findApplyEmail, isEmail } from "@/lib/mail/contact";

describe("findApplyEmail", () => {
  it("prend la première adresse de contact, en minuscules, sans point final", () => {
    expect(findApplyEmail("Envoyez votre CV à Jobs@Acme.fr.")).toBe("jobs@acme.fr");
  });
  it("ignore noreply, support et les images, prend la suivante", () => {
    expect(findApplyEmail("noreply@acme.fr support@acme.fr logo@2x.png rh@acme.fr")).toBe("rh@acme.fr");
  });
  it("renvoie null quand il n'y a aucune adresse exploitable", () => {
    expect(findApplyEmail("Postulez sur notre site.")).toBeNull();
    expect(findApplyEmail("no-reply@acme.fr")).toBeNull();
    expect(findApplyEmail(null)).toBeNull();
  });
});

describe("isEmail", () => {
  it("valide la forme minimale", () => {
    expect(isEmail("a@b.fr")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a b@c.fr")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseContacts } from "@/lib/mail/contacts-file";

describe("parseContacts", () => {
  it("lit adresse + entreprise, CSV ou TSV, en ignorant l'en-tête", () => {
    const txt = 'email;entreprise\r\nrh@acme.fr;Acme SA\n"Jobs@Beta.io", "Beta"\ncontact@gamma.com\tGamma';
    expect(parseContacts(txt)).toEqual([
      { email: "rh@acme.fr", company: "Acme SA" },
      { email: "jobs@beta.io", company: "Beta" },
      { email: "contact@gamma.com", company: "Gamma" },
    ]);
  });
  it("déduit l'entreprise du domaine, sauf messagerie grand public, et dédoublonne", () => {
    const txt = "rh@delta-corp.fr\nrh@delta-corp.fr\nmoi@gmail.com";
    expect(parseContacts(txt)).toEqual([
      { email: "rh@delta-corp.fr", company: "Delta-corp" },
      { email: "moi@gmail.com", company: "moi@gmail.com" },
    ]);
  });
  it("ignore noreply et les lignes sans adresse", () => {
    expect(parseContacts("noreply@acme.fr\nrien ici\n")).toEqual([]);
  });
});

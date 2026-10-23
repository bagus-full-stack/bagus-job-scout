import { describe, expect, it } from "vitest";
import { checkDomain, checkDomains } from "@/lib/mail/dns-check";

describe("checkDomain (sans réseau)", () => {
  it("refuse les domaines jetables et vides", async () => {
    expect(await checkDomain("Mailinator.com")).toBe("invalid");
    expect(await checkDomain("")).toBe("invalid");
  });
  it("ne fait qu'une requête par domaine distinct", async () => {
    const r = await checkDomains(["yopmail.com", "YOPMAIL.com", "mailinator.com"]);
    expect([...r.keys()].sort()).toEqual(["mailinator.com", "yopmail.com"]);
  });
});

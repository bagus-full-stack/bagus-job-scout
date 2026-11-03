import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getOffre } from "@/lib/db/offres";
import { saveProfile } from "@/lib/db/queries";
import { profile } from "./fixtures";

vi.mock("@/lib/ai/extract-offre", () => ({
  extractOffre: async () => ({ title: "Chef de projet digital", company: "Entreprise Exemple", country: "France", location: "Lyon", contract_type: "cdi" }),
}));

const { POST } = await import("@/app/api/offres/manual/route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/offres/manual", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("coller une offre", () => {
  beforeAll(() => {
    const { id, created_at, updated_at, ...rest } = profile as unknown as Record<string, unknown>;
    void id; void created_at; void updated_at;
    saveProfile(rest as never);
  });

  it("refuse un texte trop court", async () => {
    expect((await post({ text: "trop court" })).status).toBe(400);
  });

  it("affiche l'annonce (paragraphes échappés) et la note, sans doubler un texte collé deux fois", async () => {
    const text = "Chef de projet digital <b>H/F</b>\n\nPilotage de projets web, gestion de projet et SQL pour une PME lyonnaise.";
    const a = await (await post({ text })).json();
    const b = await (await post({ text })).json();
    expect(b.id).toBe(a.id);
    const o = getOffre(a.id)!;
    expect(o.description_html).toContain("<p>");
    expect(o.description_html).toContain("&lt;b&gt;");
    expect(o.description_html).not.toContain("<b>");
    expect(o.score).toBeGreaterThan(0);
  });

  it("la purge garde l'offre collée, même sans candidature ni document", async () => {
    const { id } = await (await post({ text: "Développeur web <i>H/F</i>\n\nCréation d'applications React et Node pour une agence parisienne, CDI." })).json();
    const { POST: purge } = await import("@/app/api/offres/purge/route");
    await purge(new NextRequest("http://localhost/api/offres/purge", { method: "POST", body: "{}" }));
    expect(getOffre(id)).not.toBeNull();
  });
});

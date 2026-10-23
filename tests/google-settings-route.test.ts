import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getGoogleKey, getSites, getWeb, saveGoogleKey } from "@/lib/scrapers/google";
import { GET, POST } from "@/app/api/settings/google/route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/settings/google", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/settings/google", () => {
  it("refuse un site qui n'est pas un domaine, sans rien enregistrer", async () => {
    for (const bad of ['x.com" OR site:evil.com', "reddit", "a b.com"]) {
      const res = await post({ key: "k", sites: ["linkedin.com/posts", bad], web: false });
      expect(res.status).toBe(400);
    }
    expect(getGoogleKey()).toBeNull();
    expect(getSites()).toEqual(["linkedin.com/posts", "apec.fr"]); // défaut inchangé
  });

  it("refuse une liste vide quand les pages d'entreprises sont décochées", async () => {
    expect((await post({ key: "k", sites: [], web: false })).status).toBe(400);
    expect((await post({ key: "k", sites: ["  "], web: false })).status).toBe(400);
  });

  it("refuse plus de 10 sites", async () => {
    const sites = Array.from({ length: 11 }, (_, i) => `site${i}.com`);
    expect((await post({ key: "k", sites, web: false })).status).toBe(400);
  });

  it("exige une clé tant qu'aucune n'est enregistrée", async () => {
    expect((await post({ key: "", sites: ["x.com"], web: false })).status).toBe(400);
  });

  it("enregistre la clé chiffrée et la liste normalisée, sans doublon ; web seul accepté", async () => {
    const res = await post({ key: "serp-1", sites: ["https://www.Reddit.com/", "reddit.com", "twitter.com"], web: true });
    expect(await res.json()).toMatchObject({ ok: true, sites: ["reddit.com", "x.com"], web: true });
    expect(getGoogleKey()).toBe("serp-1");
    expect(getSites()).toEqual(["reddit.com", "x.com"]);
    expect(getWeb()).toBe(true);
    expect((await post({ key: "", sites: [], web: true })).status).toBe(200);
    expect(getSites()).toEqual([]);
  });

  it("une clé vide garde l'ancienne ; le GET ne renvoie jamais la clé", async () => {
    saveGoogleKey("serp-2");
    expect((await post({ key: "", sites: ["apec.fr"], web: false })).status).toBe(200);
    expect(getGoogleKey()).toBe("serp-2");
    const body = await (await GET()).json();
    expect(body).toEqual({ configured: true, sites: ["apec.fr"], web: false });
    expect(JSON.stringify(body)).not.toContain("serp-2");
  });
});

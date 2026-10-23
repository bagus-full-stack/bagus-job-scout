import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken, safeNext, verifySessionToken } from "@/lib/auth/session";
import { middleware } from "@/middleware";

const env = { ...process.env };
beforeEach(() => {
  process.env.JOBSCOUT_HOSTED = "1";
  process.env.JOBSCOUT_ACCESS_PASSWORD = "mot-de-passe-de-test";
  delete process.env.JOBSCOUT_SESSION_SECRET;
});
afterEach(() => {
  process.env = { ...env };
});

const req = (path: string, init: { method?: string; headers?: Record<string, string>; token?: string } = {}) =>
  new NextRequest(`https://jobscout.example${path}`, {
    method: init.method,
    headers: { host: "jobscout.example", ...init.headers, ...(init.token ? { cookie: `${SESSION_COOKIE}=${init.token}` } : {}) },
  });

describe("jeton de session", () => {
  it("valide un jeton frais, refuse un jeton expiré, falsifié ou signé avec un autre secret", async () => {
    const t = await createSessionToken();
    expect(await verifySessionToken(t)).toBe(true);
    expect(await verifySessionToken(t, Date.now() + SESSION_TTL_MS + 1000)).toBe(false);
    expect(await verifySessionToken(t.slice(0, -1) + (t.endsWith("0") ? "1" : "0"))).toBe(false);
    expect(await verifySessionToken(t.replace(/^v1\.\d+/, `v1.${Date.now() + 10 * SESSION_TTL_MS}`))).toBe(false);
    process.env.JOBSCOUT_SESSION_SECRET = "autre";
    expect(await verifySessionToken(t)).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("n'importe quoi")).toBe(false);
  });
});

describe("safeNext", () => {
  it("n'accepte que des chemins du site", () => {
    expect(safeNext("/offres?page=2")).toBe("/offres?page=2");
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "evil", "", null, undefined]) expect(safeNext(bad as never)).toBe("/");
  });
});

describe("middleware hébergé", () => {
  it("sans mot de passe configuré, rien n'est servi (503), sauf la sonde de santé", async () => {
    delete process.env.JOBSCOUT_ACCESS_PASSWORD;
    expect((await middleware(req("/offres"))).status).toBe(503);
    expect((await middleware(req("/api/health"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("redirige les pages vers /login et refuse l'API (401) sans session", async () => {
    const page = await middleware(req("/offres?page=2", { headers: { "x-forwarded-proto": "https" } }));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://jobscout.example/login?next=%2Foffres%3Fpage%3D2");
    expect((await middleware(req("/api/profile"))).status).toBe(401);
  });

  it("laisse passer la connexion et la sonde sans session", async () => {
    for (const p of ["/login", "/api/auth/login", "/api/health"]) expect((await middleware(req(p))).headers.get("x-middleware-next"), p).toBe("1");
  });

  it("laisse passer avec une session valide, refuse avec une session invalide", async () => {
    const token = await createSessionToken();
    expect((await middleware(req("/api/profile", { token }))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(req("/api/profile", { token: token.slice(0, -2) + "00" }))).status).toBe(401);
  });

  it("bloque les requêtes venues d'un autre site, même connecté", async () => {
    const token = await createSessionToken();
    expect((await middleware(req("/api/profile", { token, headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    const post = await middleware(req("/api/profile", { method: "POST", token, headers: { origin: "https://evil.test" } }));
    expect(post.status).toBe(403);
    const ok = await middleware(req("/api/profile", { method: "POST", token, headers: { origin: "https://jobscout.example" } }));
    expect(ok.headers.get("x-middleware-next")).toBe("1");
  });

  it("derrière un proxy, compare l'origine à x-forwarded-host", async () => {
    const token = await createSessionToken();
    const r = new NextRequest("http://0.0.0.0:3000/api/profile", {
      method: "POST",
      headers: { host: "0.0.0.0:3000", "x-forwarded-host": "jobscout.example", origin: "https://jobscout.example", cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect((await middleware(r)).headers.get("x-middleware-next")).toBe("1");
  });

  it("interdit les actions locales (explorateur, dossier, moteur) même connecté", async () => {
    const token = await createSessionToken();
    for (const p of ["/api/settings/open-folder", "/api/settings/docs-folder", "/api/engine"])
      expect((await middleware(req(p, { method: "POST", token }))).status, p).toBe(403);
  });
});

describe("middleware local (par défaut)", () => {
  it("garde le comportement d'origine : hôte local seulement, pas de connexion", async () => {
    delete process.env.JOBSCOUT_HOSTED;
    const local = new NextRequest("http://127.0.0.1:3000/api/profile", { headers: { host: "127.0.0.1:3000" } });
    expect((await middleware(local)).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(req("/api/profile"))).status).toBe(403);
    expect((await middleware(req("/offres"))).headers.get("x-middleware-next")).toBe("1");
  });
});

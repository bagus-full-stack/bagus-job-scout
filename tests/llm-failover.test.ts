import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmHttpError, LlmTransportError, callStructured, failoverReason, resetCooldowns } from "@/lib/ai/llm";
import { LlmNotConfiguredError } from "@/lib/ai/client";

// Fournisseur actif : gemini ; secours : openai (les deux « compatibles OpenAI », réponses simulées par fetch).
const cfgOf = (provider: "gemini" | "openai") => ({
  mode: "byok",
  provider,
  kind: "openai-compatible",
  apiKey: "k",
  baseURL: `http://${provider}.test/v1`,
  models: { writer: "w", reviewer: "r" },
  source: "settings",
});
const recorded: unknown[] = [];
vi.mock("@/lib/ai/client", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/client")>();
  return {
    ...real,
    getLlmConfig: () => cfgOf("gemini"),
    fallbackConfigs: () => [cfgOf("openai")],
    recordFallback: (...a: unknown[]) => recorded.push(a),
  };
});

const REQ = {
  role: "writer",
  system: "s",
  user: "u",
  tool: { name: "t", description: "d", input_schema: { type: "object", properties: {} } },
  maxTokens: 10,
} as never;
const OK = JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "t", arguments: "{}" } }] } }], usage: {} });

const calls: string[] = [];
function deps(behaviour: Record<"gemini" | "openai", () => Response>) {
  return {
    sleep: async () => {},
    fetch: (async (url: string) => {
      const host = String(url).includes("gemini") ? "gemini" : "openai";
      calls.push(host);
      return behaviour[host]();
    }) as unknown as typeof fetch,
  };
}
const status = (code: number, body = "x") => () => new Response(body, { status: code });
const good = () => new Response(OK);

describe("failoverReason", () => {
  it("bascule sur crédit, quota, clé refusée, surcharge et réseau", () => {
    expect(failoverReason(Object.assign(new Error("Your credit balance is too low"), { status: 400 }))).toBe("crédit épuisé");
    expect(failoverReason(new LlmHttpError(429, "gemini", "quota exceeded"))).toBe("quota dépassé");
    expect(failoverReason(new LlmHttpError(401, "openai", "bad key"))).toBe("clé refusée");
    expect(failoverReason(new LlmHttpError(503, "openai", "down"))).toBe("indisponible (HTTP 503)");
    expect(failoverReason(new LlmTransportError("openai", "http://x", true))).toBe("délai dépassé");
    expect(failoverReason(new LlmTransportError("openai", "http://x", false))).toBe("injoignable");
  });
  it("ne bascule pas sur une demande refusée, une réponse mal formée ou l'absence de configuration", () => {
    expect(failoverReason(new LlmHttpError(400, "openai", "invalid schema"))).toBeNull();
    expect(failoverReason(new LlmHttpError(422, "openai", "bad"))).toBeNull();
    expect(failoverReason(new Error("JSON illisible"))).toBeNull();
    expect(failoverReason(new LlmNotConfiguredError())).toBeNull();
  });
});

describe("callStructured avec secours", () => {
  beforeEach(() => {
    calls.length = 0;
    recorded.length = 0;
    resetCooldowns();
  });

  it("passe au secours quand le fournisseur actif est à court de quota, puis l'écarte quelques minutes", async () => {
    const d = deps({ gemini: status(429, "quota exceeded"), openai: good });
    const r = await callStructured(REQ, undefined, d);
    expect(r.provider).toBe("openai");
    expect(calls).toEqual(["gemini", "gemini", "openai"]); // 429 : un nouvel essai interne, puis bascule
    expect(recorded).toEqual([["gemini", "openai", "quota dépassé"]]);

    calls.length = 0;
    await callStructured(REQ, undefined, d);
    expect(calls).toEqual(["openai"]); // gemini écarté : pas de délai ni d'appel inutile
  });

  it("une demande refusée (400) ne bascule pas", async () => {
    await expect(callStructured(REQ, undefined, deps({ gemini: status(400, "bad request"), openai: good }))).rejects.toBeInstanceOf(LlmHttpError);
    expect(calls.every((c) => c === "gemini")).toBe(true);
  });

  it("si tous les fournisseurs échouent, l'erreur du dernier est renvoyée", async () => {
    await expect(callStructured(REQ, undefined, deps({ gemini: status(503), openai: status(401, "bad key") }))).rejects.toMatchObject({ status: 401 });
    expect(calls).toContain("openai");
  });

  it("une configuration explicite ne bascule jamais", async () => {
    await expect(callStructured(REQ, cfgOf("gemini") as never, deps({ gemini: status(503), openai: good }))).rejects.toBeInstanceOf(LlmHttpError);
    expect(calls.every((c) => c === "gemini")).toBe(true);
  });
});

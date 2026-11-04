import { beforeEach, describe, expect, it } from "vitest";
import { setSetting } from "@/lib/db";
import { byokConfigFor, fallbackConfigs, getLlmState, readExtraKeys, saveExtraKeys, saveProviderKey } from "@/lib/ai/client";
import { callStructured, resetCooldowns } from "@/lib/ai/llm";

const REQ = {
  role: "writer",
  system: "s",
  user: "u",
  tool: { name: "t", description: "d", input_schema: { type: "object", properties: {} } },
  maxTokens: 10,
} as never;
const OK = JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "t", arguments: "{}" } }] } }], usage: {} });

/** Fournisseur qui ne répond que pour les clés de `good` ; les autres reçoivent un 429. */
function deps(good: string[], seen: string[]) {
  return {
    sleep: async () => {},
    fetch: (async (_url: string, init: RequestInit) => {
      const key = String((init.headers as Record<string, string>).authorization).replace("Bearer ", "");
      seen.push(key);
      return good.includes(key) ? new Response(OK) : new Response("quota exceeded", { status: 429 });
    }) as unknown as typeof fetch,
  };
}

beforeEach(() => {
  resetCooldowns();
  setSetting("llm:mode", "byok");
  setSetting("llm:provider", "gemini");
  setSetting("llm:fallbacks", "[]");
  saveProviderKey("gemini", "key-main");
  saveExtraKeys("gemini", []);
});

describe("plusieurs clés d'un même fournisseur", () => {
  it("garde les clés supplémentaires chiffrées, sans doublon ni clé principale, et ne les expose qu'en indices", () => {
    saveExtraKeys("gemini", ["key-two-abcd", " key-three ", "key-two-abcd", "key-main", ""]);
    expect(readExtraKeys("gemini")).toEqual(["key-two-abcd", "key-three"]);
    const json = JSON.stringify(getLlmState());
    expect(getLlmState().providers.gemini.extraKeyHints).toEqual(["…abcd", "…hree"]);
    expect(json).not.toContain("key-two-abcd");
    saveExtraKeys("gemini", []);
    expect(readExtraKeys("gemini")).toEqual([]);
  });

  it("les autres clés passent avant les fournisseurs de secours", () => {
    setSetting("llm:fallbacks", JSON.stringify(["openai"]));
    saveProviderKey("openai", "oa-main");
    saveExtraKeys("gemini", ["key-two"]);
    expect(fallbackConfigs(byokConfigFor("gemini")!).map((c) => `${c.provider}:${c.apiKey}`)).toEqual(["gemini:key-two", "openai:oa-main"]);
  });

  it("passe à la clé suivante sur un quota (429), puis évite la clé épuisée pendant le délai d'écart", async () => {
    saveExtraKeys("gemini", ["key-two", "key-three"]);
    const seen: string[] = [];
    await callStructured(REQ, undefined, deps(["key-two", "key-three"], seen));
    expect([...new Set(seen)]).toEqual(["key-main", "key-two"]);
    seen.length = 0;
    await callStructured(REQ, undefined, deps(["key-two", "key-three"], seen));
    expect([...new Set(seen)]).toEqual(["key-two"]); // key-main est écartée, ses sœurs non
  });

  it("sans clé supplémentaire, rien ne change : l'erreur de quota remonte", async () => {
    await expect(callStructured(REQ, undefined, deps([], []))).rejects.toMatchObject({ status: 429 });
  });
});

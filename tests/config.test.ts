import { beforeEach, describe, expect, it } from "vitest";
import { getSetting, setSetting } from "@/lib/db";
import {
  LLM_SETTING_KEYS,
  MODELS,
  readProviderKey,
  saveProviderKey,
  getLlmConfig,
  getLlmState,
  providerBaseUrlSetting,
  providerKeySetting,
  providerModelsSetting,
} from "@/lib/ai/client";
import { PROVIDER_IDS } from "@/lib/ai/providers";

function clearAll() {
  for (const k of Object.values(LLM_SETTING_KEYS)) setSetting(k, "");
  for (const id of PROVIDER_IDS) {
    setSetting(providerKeySetting(id), "");
    setSetting(providerBaseUrlSetting(id), "");
    setSetting(providerModelsSetting(id), "");
  }
}

describe("configuration IA", () => {
  beforeEach(clearAll);

  it("rien de configuré → mode unset (et aucune clé d'environnement utilisée par les tests)", () => {
    expect(getLlmConfig().mode).toBe("unset");
    expect(getLlmState().configured).toBe(false);
  });

  it("installation ≤ 3.4.10 (llm:mode=byok + llm:byok_key, sans fournisseur) → Anthropic, sans rien refaire", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:byok_key", "fausse-cle-ancienne-1234");
    const cfg = getLlmConfig();
    expect(cfg.mode).toBe("byok");
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.kind).toBe("anthropic");
    expect(cfg.apiKey).toBe("fausse-cle-ancienne-1234");
    expect(cfg.models).toEqual({ writer: MODELS.opus, reviewer: MODELS.sonnet });
  });

  it("fournisseur compatible OpenAI avec clé et modèles enregistrés", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "openai");
    setSetting(providerKeySetting("openai"), "sk-test-openai-9999");
    setSetting(providerModelsSetting("openai"), JSON.stringify({ writer: "gpt-x", reviewer: "gpt-x-mini" }));
    const cfg = getLlmConfig();
    expect(cfg).toMatchObject({
      mode: "byok",
      provider: "openai",
      kind: "openai-compatible",
      apiKey: "sk-test-openai-9999",
      baseURL: "https://api.openai.com/v1",
      models: { writer: "gpt-x", reviewer: "gpt-x-mini" },
    });
  });

  it("clé enregistrée chiffrée dans la base, relue en clair", () => {
    saveProviderKey("openai", "sk-test-openai-9999");
    const stored = getSetting(providerKeySetting("openai"))!;
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain("sk-test");
    expect(readProviderKey("openai")).toBe("sk-test-openai-9999");
  });

  it("clé obligatoire absente → non configuré", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "mistral");
    expect(getLlmConfig().mode).toBe("unset");
  });

  it("Ollama sans clé, adresse personnalisée → configuré", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "ollama");
    setSetting(providerBaseUrlSetting("ollama"), "http://127.0.0.1:11500/v1/");
    const cfg = getLlmConfig();
    expect(cfg.mode).toBe("byok");
    expect(cfg.apiKey).toBeNull();
    expect(cfg.baseURL).toBe("http://127.0.0.1:11500/v1");
  });

  it("« Autre » sans modèle ni adresse → non configuré", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "custom");
    expect(getLlmConfig().mode).toBe("unset");
  });

  it("modèle de relecture absent → même modèle que la rédaction", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "deepseek");
    setSetting(providerKeySetting("deepseek"), "sk-deepseek-0000");
    setSetting(providerModelsSetting("deepseek"), JSON.stringify({ writer: "deepseek-chat" }));
    expect(getLlmConfig().models).toEqual({ writer: "deepseek-chat", reviewer: "deepseek-chat" });
  });

  it("l'état envoyé à l'interface ne contient jamais de clé en clair", () => {
    setSetting("llm:mode", "byok");
    setSetting("llm:provider", "gemini");
    setSetting(providerKeySetting("gemini"), "AIzaSECRETSECRETSECRET1234");
    setSetting(providerKeySetting("anthropic"), "fausse-cle-SECRETSECRET5678");
    const state = getLlmState();
    const json = JSON.stringify(state);
    expect(json).not.toContain("SECRET");
    expect(state.provider).toBe("gemini");
    expect(state.byokHint).toBe("…1234");
    expect(state.providers.anthropic.keyHint).toBe("…5678");
    expect(state.configured).toBe(true);
  });

  it("mode pack ignoré si aucun proxy n'est configuré", () => {
    setSetting("llm:mode", "pack");
    setSetting("llm:license_key", "JSC-LICENCE-TEST");
    expect(getLlmConfig().mode).toBe("unset");
  });
});

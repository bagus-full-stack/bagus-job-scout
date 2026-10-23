import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSetting, setSetting } from "@/lib/db";
import { PROVIDERS, isProviderId, normalizeBaseURLInput, type ProviderId, type ProviderKind } from "./providers";

/**
 * Configuration de la génération IA, relue à CHAQUE appel.
 *
 * - mode « pack »  : appels via le proxy JobScout (format Anthropic), authentifiés
 *   par la clé de licence. `maxRetries: 0` + timeout long : le proxy rembourse
 *   les échecs, c'est l'UI qui propose « Réessayer ».
 * - mode « byok »  : clé personnelle chez le fournisseur choisi (Anthropic,
 *   OpenAI, Gemini, Mistral, DeepSeek, Groq, OpenRouter, Ollama, LM Studio ou
 *   tout serveur compatible OpenAI — voir providers.ts).
 *
 * Le build standalone duplique ce module dans plusieurs bundles : le cache du
 * client Anthropic vit sur `globalThis` et se reconstruit dès que l'empreinte
 * de configuration change.
 *
 * `baseURL` est TOUJOURS passé explicitement pour neutraliser une
 * `ANTHROPIC_BASE_URL` qui traînerait dans l'environnement du poste.
 */

/**
 * URL du proxy JobScout : AUCUNE par défaut. Le mode « Pack » n'existe que si
 * une URL est fournie par l'environnement (JOBSCOUT_PROXY_URL). La version publiée
 * sur GitHub n'en configure aucune.
 */
export const DEFAULT_PROXY_URL = "";

/** API Anthropic directe (mode BYOK). Surcharge test/debug uniquement. */
const ANTHROPIC_API_URL = "https://api.anthropic.com";

export type LlmMode = "pack" | "byok" | "unset";
export type LlmRole = "writer" | "reviewer";

/** Clés de la table settings — partagées avec la route /api/settings/llm. */
export const LLM_SETTING_KEYS = {
  mode: "llm:mode",
  licenseKey: "llm:license_key",
  /** Clé Anthropic (nom historique, conservé : les installations ≤ 3.4.10 continuent de fonctionner). */
  byokKey: "llm:byok_key",
  provider: "llm:provider",
  /** Fournisseurs de secours, dans l'ordre d'essai : JSON ["gemini", "openai"]. */
  fallbacks: "llm:fallbacks",
  /** Dernière bascule : JSON { from, to, reason, at }. */
  lastFallback: "llm:last_fallback",
} as const;

/** Clé API d'un fournisseur (Anthropic garde son nom historique). */
export const providerKeySetting = (p: ProviderId): string =>
  p === "anthropic" ? LLM_SETTING_KEYS.byokKey : `llm:key:${p}`;
/** URL de base choisie pour un fournisseur à adresse modifiable (Ollama, LM Studio, Autre). */
export const providerBaseUrlSetting = (p: ProviderId): string => `llm:base_url:${p}`;
/** Modèles choisis pour un fournisseur : JSON { writer, reviewer }. */
export const providerModelsSetting = (p: ProviderId): string => `llm:models:${p}`;

/** Levée quand aucune configuration IA n'existe — traduite en 400 côté routes. */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      "Génération IA non configurée — choisissez un fournisseur d'IA et renseignez votre clé dans Profil › Génération IA."
    );
    this.name = "LlmNotConfiguredError";
  }
}

/** Normalise une URL de proxy : supprime les `/` et le `/v1` finaux (le SDK ajoute `/v1/messages`). */
export function normalizeProxyUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/\/v1$/i, "").replace(/\/+$/, "");
  return url;
}

/** URL effective du proxy (environnement, sinon défaut) — chaîne vide si aucune. */
export function proxyBaseUrl(): string {
  const fromEnv = process.env.JOBSCOUT_PROXY_URL?.trim();
  return normalizeProxyUrl(fromEnv || DEFAULT_PROXY_URL);
}

/** Le mode « relais » (pack) n'est proposé que si un proxy est configuré. */
export function packAvailable(): boolean {
  return proxyBaseUrl().length > 0;
}

/** URL de l'API Anthropic (BYOK). `JOBSCOUT_ANTHROPIC_BASE_URL` sert aux tests (mock local). */
export function anthropicBaseUrl(): string {
  const fromEnv = process.env.JOBSCOUT_ANTHROPIC_BASE_URL?.trim();
  return normalizeProxyUrl(fromEnv || ANTHROPIC_API_URL);
}

// IDs de modèles Anthropic par défaut, surchargeables via env
// (JOBSCOUT_MODEL_OPUS / JOBSCOUT_MODEL_SONNET) sans redéployer.
// En mode pack, le proxy FORCE de toute façon le modèle côté serveur.
export const MODELS = {
  // Rédaction : extraction CV, génération CV, lettre et message V.I.E
  opus: process.env.JOBSCOUT_MODEL_OPUS || PROVIDERS.anthropic.models.writer,
  // Relecture : relecture, traduction, réparation ciblée de la lettre
  sonnet: process.env.JOBSCOUT_MODEL_SONNET || PROVIDERS.anthropic.models.reviewer,
} as const;

export type LlmConfig = {
  mode: LlmMode;
  provider: ProviderId;
  kind: ProviderKind;
  /** Clé active (licence ou clé du fournisseur). Ne JAMAIS la renvoyer au navigateur. */
  apiKey: string | null;
  baseURL: string;
  models: { writer: string; reviewer: string };
  /** "settings" = configuré par l'utilisateur ; "env" = rétro-compat dev. */
  source: "settings" | "env" | null;
};

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

/** Modèles enregistrés pour un fournisseur, sinon ses valeurs par défaut. */
export function providerModels(p: ProviderId): { writer: string; reviewer: string } {
  const defaults =
    p === "anthropic" ? { writer: MODELS.opus, reviewer: MODELS.sonnet } : PROVIDERS[p].models;
  const raw = clean(getSetting(providerModelsSetting(p)));
  if (!raw) return { ...defaults };
  try {
    const v = JSON.parse(raw) as { writer?: unknown; reviewer?: unknown };
    const w = typeof v.writer === "string" ? v.writer.trim() : "";
    const r = typeof v.reviewer === "string" ? v.reviewer.trim() : "";
    return { writer: w || defaults.writer, reviewer: r || w || defaults.reviewer };
  } catch {
    return { ...defaults };
  }
}

/** URL de base effective d'un fournisseur. */
export function providerBaseUrl(p: ProviderId): string {
  if (p === "anthropic") return anthropicBaseUrl();
  const preset = PROVIDERS[p];
  if (preset.editableBaseURL) {
    const stored = clean(getSetting(providerBaseUrlSetting(p)));
    // Adresse enregistrée avant la 3.4.14 (ex. « http://127.0.0.1:11434 » sans /v1) :
    // corrigée à la lecture, pour que Vérifier, l'affichage et la génération utilisent la même.
    if (stored) return normalizeBaseURLInput(stored, p).replace(/\/+$/, "");
  }
  return preset.baseURL.replace(/\/+$/, "");
}

/** Fournisseur choisi (Anthropic si rien n'est enregistré : installations antérieures). */
export function currentProvider(): ProviderId {
  const p = clean(getSetting(LLM_SETTING_KEYS.provider));
  return isProviderId(p) ? p : "anthropic";
}

/** Configuration « clé personnelle » d'un fournisseur donné, ou null s'il n'est pas prêt (clé ou modèles absents). */
export function byokConfigFor(provider: ProviderId): LlmConfig | null {
  const preset = PROVIDERS[provider];
  const apiKey = clean(getSetting(providerKeySetting(provider)));
  const baseURL = providerBaseUrl(provider);
  const models = providerModels(provider);
  const ready = (apiKey || !preset.keyRequired) && baseURL && models.writer && models.reviewer;
  return ready ? { mode: "byok", provider, kind: preset.kind, apiKey, baseURL, models, source: "settings" } : null;
}

/** Fournisseurs de secours enregistrés, dans l'ordre d'essai (sans doublon, identifiants connus seulement). */
export function fallbackOrder(): ProviderId[] {
  try {
    const raw = JSON.parse(getSetting(LLM_SETTING_KEYS.fallbacks) ?? "[]");
    return Array.isArray(raw) ? [...new Set(raw.filter(isProviderId))] : [];
  } catch {
    return [];
  }
}

/** Configurations de secours prêtes à servir derrière `primary` (jamais en mode relais : un seul serveur). */
export function fallbackConfigs(primary: LlmConfig): LlmConfig[] {
  if (primary.mode !== "byok") return [];
  return fallbackOrder()
    .filter((p) => p !== primary.provider)
    .map(byokConfigFor)
    .filter((c): c is LlmConfig => c !== null);
}

export type LastFallback = { from: ProviderId; to: ProviderId; reason: string; at: string };

export function getLastFallback(): LastFallback | null {
  try {
    const v = JSON.parse(getSetting(LLM_SETTING_KEYS.lastFallback) ?? "null");
    return v && isProviderId(v.from) && isProviderId(v.to) ? (v as LastFallback) : null;
  } catch {
    return null;
  }
}

/** Mémorise une bascule (au plus une écriture par paire et par tranche de 10 min : un lot ne réécrit pas la base à chaque appel). */
export function recordFallback(from: ProviderId, to: ProviderId, reason: string) {
  const last = getLastFallback();
  if (last && last.from === from && last.to === to && Date.now() - Date.parse(last.at) < 600_000) return;
  setSetting(LLM_SETTING_KEYS.lastFallback, JSON.stringify({ from, to, reason, at: new Date().toISOString() }));
}

/**
 * Lit la configuration au moment de l'appel (jamais mise en cache : c'est
 * l'empreinte qui pilote la reconstruction du client).
 */
export function getLlmConfig(): LlmConfig {
  const mode = clean(getSetting(LLM_SETTING_KEYS.mode));
  const licenseKey = clean(getSetting(LLM_SETTING_KEYS.licenseKey));

  if (mode === "pack" && licenseKey && packAvailable()) {
    return {
      mode: "pack",
      provider: "anthropic",
      kind: "anthropic",
      apiKey: licenseKey,
      baseURL: proxyBaseUrl(),
      models: { writer: MODELS.opus, reviewer: MODELS.sonnet },
      source: "settings",
    };
  }

  if (mode === "byok") {
    const provider = currentProvider();
    const preset = PROVIDERS[provider];
    const apiKey = clean(getSetting(providerKeySetting(provider)));
    const baseURL = providerBaseUrl(provider);
    const models = providerModels(provider);
    const ready = (apiKey || !preset.keyRequired) && baseURL && models.writer && models.reviewer;
    if (ready) return { mode: "byok", provider, kind: preset.kind, apiKey, baseURL, models, source: "settings" };
  }

  // Rétro-compat développement UNIQUEMENT : une ANTHROPIC_API_KEY d'environnement
  // ne doit JAMAIS être consommée par un build de production (la clé perso d'un
  // utilisateur serait utilisée sans son consentement).
  if (process.env.NODE_ENV !== "production") {
    const envKey = clean(process.env.ANTHROPIC_API_KEY);
    // « sk-ant-... » recopié tel quel depuis .env.example n'est pas une clé.
    if (envKey && !envKey.includes("...")) {
      return {
        mode: "byok",
        provider: "anthropic",
        kind: "anthropic",
        apiKey: envKey,
        baseURL: anthropicBaseUrl(),
        models: { writer: MODELS.opus, reviewer: MODELS.sonnet },
        source: "env",
      };
    }
  }

  return {
    mode: "unset",
    provider: currentProvider(),
    kind: PROVIDERS[currentProvider()].kind,
    apiKey: null,
    baseURL: providerBaseUrl(currentProvider()),
    models: providerModels(currentProvider()),
    source: null,
  };
}

/** Réglages d'un fournisseur montrés à l'UI : jamais de clé en clair. */
export type ProviderState = {
  keyHint: string | null;
  baseURL: string;
  models: { writer: string; reviewer: string };
};

/** État sûr pour l'UI : jamais de clé en clair, hints masqués (4 derniers symboles). */
export type LlmState = {
  mode: LlmMode;
  configured: boolean;
  source: "settings" | "env" | null;
  licenseHint: string | null;
  /** Hint de la clé du fournisseur actif (compatibilité avec l'ancienne carte). */
  byokHint: string | null;
  /** Le mode « Pack » est-il proposé (proxy configuré) ? */
  packAvailable: boolean;
  provider: ProviderId;
  providers: Record<ProviderId, ProviderState>;
};

const hint = (key: string | null): string | null =>
  key && key.length >= 8 ? `…${key.slice(-4)}` : key ? "…" : null;

export function getLlmState(): LlmState {
  const cfg = getLlmConfig();
  const providers = {} as Record<ProviderId, ProviderState>;
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    providers[id] = {
      keyHint: hint(clean(getSetting(providerKeySetting(id)))),
      baseURL: providerBaseUrl(id),
      models: providerModels(id),
    };
  }
  const provider = cfg.mode === "unset" ? currentProvider() : cfg.provider;
  return {
    mode: cfg.mode,
    configured: cfg.mode !== "unset",
    source: cfg.source,
    licenseHint: hint(clean(getSetting(LLM_SETTING_KEYS.licenseKey))),
    byokHint: providers[provider].keyHint,
    packAvailable: packAvailable(),
    provider,
    providers,
  };
}

// Cache partagé entre les copies du module dupliquées par le build standalone.
type LlmCache = { fingerprint: string; client: Anthropic };
const G = globalThis as typeof globalThis & { __jobscoutLlmClient?: LlmCache };

/** Client Anthropic (mode pack, ou BYOK Anthropic). */
export function getClaude(cfg: LlmConfig = getLlmConfig()): Anthropic {
  if (cfg.mode === "unset" || !cfg.apiKey) throw new LlmNotConfiguredError();

  const fingerprint = JSON.stringify([cfg.mode, cfg.apiKey, cfg.baseURL]);
  const cached = G.__jobscoutLlmClient;
  if (cached && cached.fingerprint === fingerprint) return cached.client;

  const client = new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    // authToken explicitement neutralisé, au même titre que baseURL : sans lui,
    // le SDK lit ANTHROPIC_AUTH_TOKEN dans l'environnement du poste et l'envoie
    // en `Authorization: Bearer …` à CHAQUE appel — y compris vers le proxy
    // JobScout, donc vers un tiers, sans consentement.
    authToken: null,
    // Mode pack : pas de retry SDK (le proxy rembourse, l'UI propose de
    // réessayer) et timeout long (génération non-streaming = minutes).
    ...(cfg.mode === "pack" ? { maxRetries: 0, timeout: 150_000 } : {}),
  });
  G.__jobscoutLlmClient = { fingerprint, client };
  return client;
}

/**
 * Best-effort : vide le cache de CE bundle (et de tous, via globalThis).
 * La vraie garantie de fraîcheur reste l'empreinte relue à chaque appel.
 */
export function resetClaude(): void {
  delete G.__jobscoutLlmClient;
}

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { browsersDir, ensureDir, envPath, homePath } from "@/lib/paths";

/**
 * Moteur de navigation (Chromium via Playwright) — utilisé UNIQUEMENT par le
 * scraper LinkedIn. Il pèse ~100 Mo à télécharger (~265 Mo une fois
 * décompressé), il n'est donc pas embarqué dans l'installeur : on le
 * télécharge à la demande, dans les données utilisateur
 * (%LOCALAPPDATA%\JobScout\browsers), au premier scan LinkedIn.
 *
 * Si l'utilisateur n'active jamais LinkedIn, rien n'est jamais téléchargé.
 */

export const ENGINE_LABEL = "moteur LinkedIn (Chromium)";
/**
 * Tailles mesurées le 30/08/2026 sur l'application installée
 * (chromium_headless_shell 1217, `--only-shell`) : ~100 Mo téléchargés,
 * 277 840 671 octets (≈ 265 Mo) sur le disque. Repris à l'identique par
 * installer/install-info.mjs (page d'information de l'installeur de test).
 */
export const ENGINE_SIZE_LABEL = "~100 Mo";
export const ENGINE_DISK_SIZE_LABEL = "~265 Mo";

/**
 * Positionne PLAYWRIGHT_BROWSERS_PATH AVANT tout chargement de playwright :
 * playwright-core fige son répertoire de registre au premier require.
 */
export function applyBrowsersPath(): string {
  const dir = resolveBrowsersDir();
  process.env.PLAYWRIGHT_BROWSERS_PATH = dir;
  return dir;
}

/** Registre Playwright par défaut (installations faites par `npx playwright install`), selon le système. */
function defaultRegistryDir(): string {
  if (process.platform === "win32") {
    const base = envPath("LOCALAPPDATA") || homePath("AppData", "Local");
    return path.join(base, "ms-playwright");
  }
  if (process.platform === "darwin") return homePath("Library", "Caches", "ms-playwright");
  return path.join(envPath("XDG_CACHE_HOME") || homePath(".cache"), "ms-playwright");
}

/** Révision du headless shell exigée par le Playwright installé (null si illisible). */
function requiredShellRevision(): string | null {
  try {
    const f = path.join(process.cwd(), "node_modules", "playwright-core", "browsers.json");
    const list = JSON.parse(fs.readFileSync(f, "utf-8")).browsers as { name: string; revision: string }[];
    return list.find((b) => b.name === "chromium-headless-shell")?.revision ?? null;
  } catch {
    return null;
  }
}

/**
 * `dir` contient-il le moteur exigé par ce Playwright ? Une autre révision (ex. 1248 dans
 * le registre global alors que 1217 est requise) ne compte pas : le lancement échouerait.
 * shortcut: sans browsers.json lisible, n'importe quel chromium* complet est accepté.
 */
export function hasCompleteChromium(dir: string, rev: string | null = requiredShellRevision()): boolean {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return false;
  }
  return entries.some(
    (name) =>
      (rev ? name === `chromium_headless_shell-${rev}` : name.startsWith("chromium")) &&
      fs.existsSync(path.join(dir, name, "INSTALLATION_COMPLETE"))
  );
}

/**
 * Répertoire de navigateurs effectif : celui de l'application s'il contient
 * un moteur, sinon le registre Playwright global s'il en a un (cas du poste
 * de développement, où `data/browsers` est vide alors que Chromium est déjà
 * installé pour l'application installée) — sinon celui de l'application,
 * où l'installation à la demande écrira.
 */
export function resolveBrowsersDir(): string {
  const app = browsersDir();
  if (hasCompleteChromium(app)) return app;
  const def = defaultRegistryDir();
  if (hasCompleteChromium(def)) return def;
  return app;
}

/**
 * Exécutable du headless shell dans le dossier résolu. Passé tel quel à `launch` : le
 * registre de playwright-core est figé au premier require, et s'il a été chargé avant
 * applyBrowsersPath il pointe sur ms-playwright (« Executable doesn't exist »).
 */
export function findShellExecutable(dir = resolveBrowsersDir()): string | null {
  const rev = requiredShellRevision();
  const exe = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith("chromium_headless_shell-") || (rev && name !== `chromium_headless_shell-${rev}`)) continue;
      const sub = fs.readdirSync(path.join(dir, name)).find((d) => d.startsWith("chrome-headless-shell"));
      const p = sub && path.join(dir, name, sub, exe);
      if (p && fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

/** Chemin du CLI playwright, résolu sans dépendre du bundler. */
function playwrightCliPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "node_modules", "playwright-core", "cli.js"),
    path.join(process.cwd(), "node_modules", "playwright", "cli.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Le moteur est-il déjà installé ? On cherche un dossier `chromium*` marqué
 * INSTALLATION_COMPLETE par Playwright — indépendant du numéro de révision.
 */
export function isEngineInstalled(): boolean {
  return hasCompleteChromium(resolveBrowsersDir());
}

export type EngineState = {
  installed: boolean;
  installing: boolean;
  progress: number | null;
  message: string;
  error: string | null;
  path: string;
};

let installing = false;
let lastMessage = "";
let lastProgress: number | null = null;
let lastError: string | null = null;

export function getEngineState(): EngineState {
  const installed = isEngineInstalled();
  return {
    installed,
    installing,
    progress: installing ? lastProgress : null,
    message: installed && !installing ? "Moteur installé." : lastMessage,
    error: lastError,
    path: resolveBrowsersDir(),
  };
}

/**
 * Lance le téléchargement du moteur (idempotent, un seul à la fois).
 * Retourne immédiatement : l'avancement se lit via getEngineState().
 */
export function startEngineInstall(): { started: boolean; reason?: string } {
  if (isEngineInstalled()) return { started: false, reason: "already-installed" };
  if (installing) return { started: false, reason: "already-running" };

  const cli = playwrightCliPath();
  if (!cli) {
    lastError =
      "Composant Playwright introuvable dans l'installation — réinstallez JobScout.";
    return { started: false, reason: "cli-missing" };
  }

  const dir = ensureDir(applyBrowsersPath());
  installing = true;
  lastError = null;
  lastProgress = 0;
  lastMessage = `Téléchargement du ${ENGINE_LABEL} (${ENGINE_SIZE_LABEL})…`;

  // --only-shell : le scraper lance toujours { headless: true }, qui n'utilise
  // que chromium_headless_shell — le Chromium complet (~410 Mo décompressés)
  // ne servirait jamais.
  const child = spawn(process.execPath, [cli, "install", "chromium", "--only-shell"], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onChunk = (buf: Buffer) => {
    const text = buf.toString("utf-8");
    // Playwright écrit « |████ | 42% of 130.2 MiB » — on récupère le pourcentage.
    const pct = [...text.matchAll(/(\d{1,3})%/g)].pop();
    if (pct) lastProgress = Math.min(100, Number(pct[1]));
    const line = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    if (line && !line.startsWith("|")) lastMessage = line.slice(0, 200);
  };
  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);

  child.on("error", (e) => {
    installing = false;
    lastError = e instanceof Error ? e.message : String(e);
  });
  child.on("close", (code) => {
    installing = false;
    lastProgress = null;
    if (code === 0 && isEngineInstalled()) {
      lastMessage = "Moteur installé.";
      lastError = null;
    } else {
      lastError = `Le téléchargement du ${ENGINE_LABEL} a échoué (code ${code}). Vérifiez votre connexion puis réessayez.`;
    }
  });

  return { started: true };
}

export const ENGINE_MISSING_MESSAGE =
  `Le ${ENGINE_LABEL} n'est pas installé. Ouvrez Profil › Sources de scan et cliquez ` +
  `« Installer le moteur LinkedIn » (${ENGINE_SIZE_LABEL} à télécharger, ${ENGINE_DISK_SIZE_LABEL} sur le disque, une seule fois).`;

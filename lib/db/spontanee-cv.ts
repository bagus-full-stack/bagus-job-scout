import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "@/lib/db";
import { ensureDir, userDataDir } from "@/lib/paths";
import { slugify } from "./documents";

/**
 * CV importé par poste visé, utilisé tel quel pour les candidatures spontanées (à la place d'un CV généré).
 * Le fichier vit dans le dossier de données ; le réglage `spontanee_cv:<poste>` en garde le chemin.
 */
const MAX_BYTES = 5 * 1024 * 1024;
const norm = (role: string) => role.trim().toLowerCase();
const key = (role: string) => `spontanee_cv:${norm(role)}`;

/** Chemin du CV importé pour ce poste, ou null s'il n'y en a pas (ou si le fichier a disparu). */
export function spontaneousCvPath(role: string): string | null {
  const p = getSetting(key(role));
  return p && fs.existsSync(p) ? p : null;
}

/** Enregistre (ou remplace) le CV du poste. Lève une erreur au message lisible si ce n'est pas un PDF acceptable. */
export function saveSpontaneousCv(role: string, buffer: Buffer): void {
  if (!norm(role)) throw new Error("Poste requis.");
  if (buffer.length > MAX_BYTES) throw new Error("Fichier trop volumineux (5 Mo maximum).");
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Le CV doit être un fichier PDF.");
  const dir = ensureDir(path.join(userDataDir(), "spontanee-cv"));
  const file = path.join(dir, `${slugify(role, 30) || "poste"}-${createHash("sha1").update(norm(role)).digest("hex").slice(0, 8)}.pdf`);
  fs.writeFileSync(file, buffer);
  setSetting(key(role), file);
}

export function removeSpontaneousCv(role: string): void {
  const p = getSetting(key(role));
  if (p) fs.rmSync(p, { force: true });
  setSetting(key(role), "");
}

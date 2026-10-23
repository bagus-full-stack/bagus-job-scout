import "server-only";
import * as XLSX from "xlsx";

/**
 * Lit un classeur Excel (.xlsx, .xls, .ods) ou un CSV/texte (encodage et séparateur détectés
 * par SheetJS, y compris l'UTF-16 d'Excel) et le remet à plat : une ligne de texte par ligne
 * du tableur, cellules séparées par « ; », toutes feuilles confondues.
 */
export function sheetsToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
    for (const row of rows) lines.push(row.map((c) => String(c ?? "")).join(";"));
  }
  return lines.join("\n");
}

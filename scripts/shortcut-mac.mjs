// Lanceur macOS de JobScout (équivalent Mac de scripts/Install-DesktopShortcut.ps1).
// Crée « JobScout.command » dans le dossier du projet, puis une copie sur le Bureau :
// un double-clic ouvre le Terminal, démarre JobScout (Mac maintenu éveillé par
// caffeinate tant qu'il tourne) et ouvre http://127.0.0.1:3000 dès qu'il répond.
// Créé sur place, le fichier n'est pas mis en quarantaine par macOS (pas de
// blocage Gatekeeper, contrairement à un script téléchargé).
// Usage, depuis le dossier du projet : npm run shortcut:mac
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (process.platform !== "darwin") {
  console.error("Ce lanceur est réservé à macOS. Sous Windows : scripts\\Install-DesktopShortcut.ps1 (voir le README).");
  process.exit(1);
}
const project = process.cwd();
if (!fs.existsSync(path.join(project, "package.json")) || !fs.existsSync(path.join(project, "node_modules"))) {
  console.error("Lancez cette commande dans le dossier de JobScout, après « npm ci ».");
  process.exit(1);
}

// Chemin entre apostrophes pour le shell (un nom de dossier peut contenir des espaces).
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const script = `#!/bin/zsh
# Lanceur JobScout, créé par « npm run shortcut:mac ». Double-cliquez pour démarrer JobScout.
cd ${q(project)} || { echo "Dossier JobScout introuvable : ${project.replace(/"/g, "")}"; echo "Recréez le lanceur avec « npm run shortcut:mac »."; read -k 1; exit 1 }
echo "JobScout démarre… Gardez cette fenêtre ouverte : la fermer arrête JobScout."
( for i in {1..120}; do sleep 1; if curl -s -o /dev/null http://127.0.0.1:3000; then open http://127.0.0.1:3000; break; fi; done ) &
exec caffeinate -i npm run dev
`;

const local = path.join(project, "JobScout.command");
fs.writeFileSync(local, script);
fs.chmodSync(local, 0o755);
console.log(`Lanceur créé : ${local}`);

const desktop = path.join(os.homedir(), "Desktop", "JobScout.command");
try {
  fs.copyFileSync(local, desktop);
  fs.chmodSync(desktop, 0o755);
  console.log(`Copie sur le Bureau : ${desktop}`);
  console.log("Double-cliquez sur « JobScout.command » sur le Bureau (le Finder peut l'afficher « JobScout ») pour démarrer JobScout.");
} catch {
  console.log("Le Bureau n'est pas accessible (macOS a peut-être demandé l'autorisation et elle a été refusée).");
  console.log("Faites glisser JobScout.command du dossier du projet vers le Bureau ou le Dock.");
}

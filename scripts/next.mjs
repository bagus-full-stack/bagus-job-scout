#!/usr/bin/env node
// Lance la CLI Next.js avec sa télémétrie anonyme coupée (NEXT_TELEMETRY_DISABLED=1).
// Next.js (Vercel) envoie sinon des statistiques d'usage à telemetry.nextjs.org lors de
// `next dev` et `next build` ; JobScout ne transmet rien, ni à son éditeur ni à Vercel
// (voir le README). Même commande sous Windows, macOS et Linux :
//   node scripts/next.mjs dev -H 127.0.0.1
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});

// Lance l'API et le site en parallèle pour le développement.
//
// Chaque serveur hérite directement du terminal (stdio: "inherit"), exactement
// comme s'il était lancé seul : certains outils (dont `next dev`) se comportent
// différemment quand leur sortie est capturée, ce qui pouvait arrêter le site
// sous WSL. Ctrl+C arrête les deux serveurs ; si l'un s'arrête, l'autre aussi.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const services = ["@kenpai/api", "@kenpai/web"];

const children = services.map((workspace) =>
  spawn(npm, ["run", "dev", "-w", workspace], { stdio: "inherit" }),
);

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  process.exitCode = code;
}

children.forEach((child, i) => {
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `\n[dev] ${services[i]} s'est arrêté (${signal ?? `code ${code}`}) : arrêt de l'autre serveur.`,
      );
    }
    stopAll(code ?? 1);
  });
});

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

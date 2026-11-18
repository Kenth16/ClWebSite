import fp from "fastify-plugin";
import { HttpError } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Protection CSRF (en complément des cookies SameSite=Lax) : toute requête
 * qui modifie des données doit provenir du site lui-même. On accepte l'origine
 * configurée (WEB_ORIGIN) ou l'hôte par lequel la requête est arrivée.
 */
export const originCheckPlugin = fp<{ webOrigin: string }>(async (app, { webOrigin }) => {
  const allowed = new URL(webOrigin).host;
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (!origin) return; // clients non navigateurs (ex. tests, curl) : pas de risque CSRF
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Origine de la requête refusée.");
    }
    const forwardedHost = request.headers["x-forwarded-host"];
    const requestHosts = [
      allowed,
      request.headers.host,
      ...(Array.isArray(forwardedHost) ? forwardedHost : [forwardedHost]),
    ].filter(Boolean);
    if (!requestHosts.includes(originHost)) {
      throw new HttpError(403, "Origine de la requête refusée.");
    }
  });
});

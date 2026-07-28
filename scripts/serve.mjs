import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useDist = process.argv.includes("--dist");
const serveRoot = useDist ? path.join(root, "dist") : root;
const portArgumentIndex = process.argv.indexOf("--port");
const requestedPort = Number(
  portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : process.env.PORT || 4173
);
const host = process.env.HOST || "127.0.0.1";
const emptyLocalConfig = [
  "/** Configuration locale virtuelle générée par le serveur de développement. */",
  "window.DEAD_GROUND_CONFIG = {",
  '  googleMapsApiKey: ""',
  "};",
  ""
].join("\n");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error(`Port invalide : ${requestedPort}`);
}

await access(serveRoot, fsConstants.R_OK);

function resolveInsideRoot(pathname) {
  const relative = pathname.replace(/^\/+/, "");
  const absolute = path.resolve(serveRoot, relative);
  const relativeToRoot = path.relative(serveRoot, absolute);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;
  return absolute;
}

async function resolveFile(pathname) {
  const normalizedPathname = pathname === "/" ? "/index.html" : pathname.replace(/\/+$/, "");
  const candidates = [normalizedPathname];
  if (!path.extname(normalizedPathname)) candidates.push(`${normalizedPathname}.html`);

  for (const candidate of candidates) {
    const absolute = resolveInsideRoot(candidate);
    if (!absolute) return null;
    try {
      const fileStats = await stat(absolute);
      if (fileStats.isFile()) return { absolute, size: fileStats.size };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return null;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      response.writeHead(400);
      response.end("Requête invalide.");
      return;
    }

    const file = await resolveFile(pathname);
    if (!file && pathname === "/config.local.js") {
      const body = Buffer.from(emptyLocalConfig, "utf8");
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.length,
        "Content-Type": contentTypes.get(".js")
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }

    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : "Fichier introuvable.");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": file.size,
      "Content-Type": contentTypes.get(path.extname(file.absolute).toLowerCase()) ?? "application/octet-stream"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(file.absolute).pipe(response);
  } catch (error) {
    console.error("Erreur du serveur statique", error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  }
});

server.on("error", (error) => {
  console.error("Impossible de démarrer le serveur statique", error);
  process.exitCode = 1;
});

server.listen(requestedPort, host, () => {
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : requestedPort;
  console.log(`Dead Ground servi depuis ${useDist ? "dist/" : "les sources"} sur http://${host}:${activePort}`);
});

function closeServer() {
  server.close(() => process.exit());
}

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);

// Launcher script for preview_start — sets required env vars and starts Vite
process.env.PORT = process.env.PORT || "5173";
process.env.BASE_PATH = process.env.BASE_PATH || "/";

import { createServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = await createServer({
  configFile: path.resolve(__dirname, "vite.config.ts"),
  server: { host: "0.0.0.0", port: parseInt(process.env.PORT) },
});
await server.listen();
server.printUrls();

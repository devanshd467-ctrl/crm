import express from "express";
import { startImportWorker } from "./imports.js";
import path from "node:path";
import { database, initialize } from "./db.js";
import { api, runReminders } from "./api.js";
process.umask(0o077);
const production = process.env.NODE_ENV === "production";
const demo =
  process.env.CRM_DEMO_MODE == null
    ? !production
    : process.env.CRM_DEMO_MODE === "true";
const db = database(
  process.env.CRM_DB ||
    (demo ? ".crm-data/demo.sqlite" : ".crm-data/production.sqlite"),
);
initialize(db, demo);
startImportWorker(db);
const app = express();
app.disable("x-powered-by");
app.use("/api", api(db, demo));
if (production) {
  app.use((req, res, next) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
    );
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  app.use(express.static("dist"));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT) || 5173;
app.listen(port, "0.0.0.0", () =>
  console.log(
    `Bull Realty Global CRM ready on port ${port} (${demo ? "demo workspace" : "private workspace"})`,
  ),
);
const timer = setInterval(() => {
  try {
    runReminders(db);
    startImportWorker(db);
  } catch (e) {
    console.error("Reminder processing:", e.message);
  }
}, 60000);
timer.unref();

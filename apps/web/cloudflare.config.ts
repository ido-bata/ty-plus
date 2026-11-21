import { defineConfig } from "cf/config";

// Keep the production Worker identity stable. cf modes are full Worker
// configurations: "preview" must never accidentally replace production.
const baseWorker = {
  entrypoint: "@tanstack/react-start/server-entry",
  compatibilityDate: "2026-11-17",
  compatibilityFlags: ["nodejs_compat"],
  workersDev: true,
};

export default defineConfig(({ mode }) => ({
  worker: {
    ...baseWorker,
    name: mode === "preview" ? "ty-plus-web-preview" : "ty-plus-web",
  },
}));

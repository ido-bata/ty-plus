import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: Number(process.env.TY_PLUS_WEB_PORT ?? 3200),
	},
	plugins: [tanstackStart(), viteReact()],
});

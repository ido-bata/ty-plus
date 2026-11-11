import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = path.resolve(__dirname, "..", "..", "..");

export default defineConfig({
	plugins: [react()],
	root: __dirname,
	resolve: {
		alias: [
			{ find: "@", replacement: path.resolve(projectRoot, "src") },
			{ find: "@esTypes", replacement: path.resolve(projectRoot, "src") },
		],
	},
	server: {
		host: "127.0.0.1",
		port: 5180,
		strictPort: true,
	},
});

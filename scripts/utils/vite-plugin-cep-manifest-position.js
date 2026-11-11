import fs from "node:fs/promises";
import path from "node:path";
// vite-cep-plugin doesn't emit <Position> in manifest.xml. Modeless dialogs can
// open off-screen without an explicit position, so we patch it post-build.
export function cepManifestPositionPlugin(opts = {}) {
	const cepDist = opts.cepDist ?? "cep";
	const x = opts.x ?? 100;
	const y = opts.y ?? 100;
	return {
		name: "typlus-cep-manifest-position",
		apply: "build",
		enforce: "post",
		async closeBundle() {
			const manifestPath = path.join(
				process.cwd(),
				"dist",
				cepDist,
				"CSXS",
				"manifest.xml",
			);
			let content;
			try {
				content = await fs.readFile(manifestPath, "utf-8");
			} catch {
				return;
			}
			const positionBlock = [
				"          <Position>",
				`            <X>${x}</X>`,
				`            <Y>${y}</Y>`,
				"          </Position>",
			].join("\n");
			let changed = false;
			const extensionBlocks = content.match(
				/<Extension Id="[^"]+">[\s\S]*?<\/Extension>\s*/g,
			);
			if (!extensionBlocks) return;
			let next = content;
			for (const block of extensionBlocks) {
				if (!block.includes("<Type>Modeless</Type>")) continue;
				if (block.includes("<Position>")) continue;
				const patched = block.replace(
					/(<Geometry>[\s\S]*?)(\s*<\/Geometry>)/,
					(_m, before, close) => {
						// Only patch if Geometry exists.
						if (before.includes("<Position>")) return `${before}${close}`;
						return `${before}\n${positionBlock}${close}`;
					},
				);
				if (patched !== block) {
					next = next.replace(block, patched);
					changed = true;
				}
			}
			if (!changed) return;
			await fs.writeFile(manifestPath, next, "utf-8");
		},
	};
}

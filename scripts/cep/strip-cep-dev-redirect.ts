import fs from "node:fs";
import path from "node:path";

const targets = [
	"dist/cep-dev/panel/index.html",
	"dist/cep-dev/dialog/index.html",
];

const redirectPattern =
	/<script>\s*window\.location\.href\s*=\s*['"]http:\/\/localhost:\d+\/[^'"]+['"];\s*<\/script>/g;

let modifiedCount = 0;
for (const target of targets) {
	const filePath = path.resolve(target);
	if (!fs.existsSync(filePath)) continue;
	const before = fs.readFileSync(filePath, "utf8");
	const after = before.replace(redirectPattern, "");
	if (before !== after) {
		fs.writeFileSync(filePath, after, "utf8");
		modifiedCount++;
	}
}

if (modifiedCount > 0) {
	console.log(
		`[strip-dev-redirect] removed localhost redirects from ${modifiedCount} file(s)`,
	);
}

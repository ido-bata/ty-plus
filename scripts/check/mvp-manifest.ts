import config from "../../cep.config";

const panelNames = config.panels?.map((panel) => panel.name) ?? [];
const expected = new Set([
	"panel1",
	"panel2",
	"panel3",
	"panel4",
	"panel5",
	"dialog",
	"dialog-preset-add",
	"dialog-preset-add-2",
	"dialog-preset-add-3",
	"dialog-preset-add-4",
	"dialog-preset-add-5",
	"dialog-preset-add-6",
	"dialog-preset-add-7",
	"dialog-preset-add-8",
	"dialog-preset-edit",
	"debug-console",
	"dialog-presets",
	"dialog-preset-library",
	"dialog-messages",
	"dialog-settings",
	"dialog-widget-selector",
	"dialog-background-panel",
]);
const extra = panelNames.filter((name) => !expected.has(name));
const missing = [...expected].filter((name) => !panelNames.includes(name));

if (extra.length || missing.length) {
	console.error("CEP manifest is not in MVP scope.");
	if (extra.length) console.error(`Unexpected entries: ${extra.join(", ")}`);
	if (missing.length) console.error(`Missing entries: ${missing.join(", ")}`);
	process.exit(1);
}

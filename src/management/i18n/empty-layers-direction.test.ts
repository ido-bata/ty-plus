/**
 * Issue #537: `workspaceShell.backgroundPanel.emptyLayers` used to tell the
 * user to "add one with the buttons on the left" in every locale, but the
 * LayerListPanel add buttons sit ABOVE the list (addBar → list → actionBar).
 * Guard: the copy must never point at a left-side button again.
 */

import { describe, expect, it } from "vitest";

import de_dialogs from "./locales/de/dialogs.json";
import en_dialogs from "./locales/en/dialogs.json";
import es_dialogs from "./locales/es/dialogs.json";
import fr_dialogs from "./locales/fr/dialogs.json";
import it_dialogs from "./locales/it/dialogs.json";
import ja_dialogs from "./locales/ja/dialogs.json";
import ko_dialogs from "./locales/ko/dialogs.json";
import pt_dialogs from "./locales/pt/dialogs.json";
import ru_dialogs from "./locales/ru/dialogs.json";
import zh_dialogs from "./locales/zh/dialogs.json";

const DIALOGS = {
	de: de_dialogs,
	en: en_dialogs,
	es: es_dialogs,
	fr: fr_dialogs,
	it: it_dialogs,
	ja: ja_dialogs,
	ko: ko_dialogs,
	pt: pt_dialogs,
	ru: ru_dialogs,
	zh: zh_dialogs,
} as const;

// Left-direction words across the shipped locales (en "left", ja "左",
// zh "左", ko "왼쪽", es "izquierda", fr "gauche", de "links",
// it "sinistra", pt "esquerda", ru "слева").
const LEFT_DIRECTION =
	/left|izquierda|gauche|links|sinistra|esquerda|слева|왼쪽|左/i;

describe("workspaceShell.backgroundPanel.emptyLayers", () => {
	for (const [locale, dialogs] of Object.entries(DIALOGS)) {
		it(`${locale} does not point at left-side buttons`, () => {
			const text = (dialogs as typeof en_dialogs).workspaceShell.backgroundPanel
				.emptyLayers;
			expect(text).toBeTruthy();
			expect(text).not.toMatch(LEFT_DIRECTION);
		});
	}
});

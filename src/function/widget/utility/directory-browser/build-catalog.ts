/**
 * Pure merge logic for `widgets/state/directory-browser.json` catalog rows.
 * Call sites resolve paths and perform I/O in management layers.
 */

export type CatalogRow = { id: string } & Record<string, unknown>;

export const buildRows = (args: {
	diskRows: readonly CatalogRow[];
	legacyRowPredicate: (id: string) => boolean;
	panelKey: string;
	catalogId: string | null;
	globalSlice: Record<string, unknown>;
}): CatalogRow[] => {
	const map = new Map(args.diskRows.map((r) => [r.id, { ...r } as CatalogRow]));
	for (const id of [...map.keys()]) {
		if (args.legacyRowPredicate(id) || id === args.panelKey) {
			map.delete(id);
		}
	}
	if (args.catalogId) {
		map.set(args.catalogId, {
			id: args.catalogId,
			...args.globalSlice,
		});
	}
	return [...map.values()];
};

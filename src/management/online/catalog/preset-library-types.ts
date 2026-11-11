export type ViewMode = "gallery" | "list" | "cards";

const PRESET_LIBRARY_ZOOM_MIN = 0.5;
const PRESET_LIBRARY_ZOOM_MAX = 2;
const PRESET_LIBRARY_ZOOM_STEP = 0.1;

const PRESET_LIBRARY_SURFACE_ID = "dialog-preset-library";

const PRESET_LIBRARY_CATALOG_LIMIT = 50;

const PRESET_LIBRARY_CTX = {
	headerClose: "ty.ctx.online-preset-library.header.close",
	bodyReload: "ty.ctx.online-preset-library.body.reload",
	sidePanelToggle: "ty.ctx.online-preset-library.sidepanel.toggle",
	viewGallery: "ty.ctx.online-preset-library.view.gallery",
	viewCards: "ty.ctx.online-preset-library.view.cards",
	viewList: "ty.ctx.online-preset-library.view.list",
	tagClearAll: "ty.ctx.online-preset-library.tag.clear-all",
	categoryClear: "ty.ctx.online-preset-library.category.clear",
	searchClear: "ty.ctx.online-preset-library.search.clear",
	clearAllFilters: "ty.ctx.online-preset-library.clear-all",
	itemDownload: "ty.ctx.online-preset-library.item.download",
	itemImport: "ty.ctx.online-preset-library.item.import",
	itemOpenNotion: "ty.ctx.online-preset-library.item.open-notion",
} as const;

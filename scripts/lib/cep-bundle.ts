type CepHost = {
	code: "AEFT";
	versionRange: string;
	debugPort: number;
};

type CepPanel = {
	extensionId: string;
	panelDisplayName: string;
	surfaceId: string;
	/**
	 * Default true. When false, host startup does not open it; use `requestOpenExtension` etc.
	 * All 5 workspace panels in archive `cep.config.ts` are true.
	 */
	autoVisible?: boolean;
	/** Default 420x560. Matches archive cep.config panel sizes. */
	panelGeometry?: { width: number; height: number };
};

/** Modeless: floating window. Panel: same event plane as workspace panels (AE often drops custom APPLICATION events to Modeless). */
type CepDialogUiKind = "modeless" | "panel";

type CepDialog = {
	extensionId: string;
	/** Window/title menu text for Modeless; Panel menu label. Ignored when emptyMenu is true. */
	dialogDisplayName: string;
	surfaceId: string;
	width: number;
	height: number;
	/** Modeless frame. Effective against `CSInterface.resizeContent` constraints (host may ignore). */
	minSize?: { width: number; height: number };
	maxSize?: { width: number; height: number };
	uiKind?: CepDialogUiKind;
	/**
	 * Emit `<Menu></Menu>` only (no surfaceId fallback). Use with AutoVisible=false and
	 * requestOpenExtension so entries stay out of host menus.
	 */
	emptyMenu?: boolean;
	/**
	 * Bundle to load instead of `./dialog.js` (or live's `/dialog.js`).
	 * HTML path is relative, pointing to `dialog/${surfaceId}.html` at the same level.
	 */
	moduleScriptRelative?: string;
};

type CreateCepBundleArtifactsOptions = {
	bundleId: string;
	extensionName: string;
	version: string;
	scriptRelativePath: string;
	liveScriptUrl?: string;
	liveDialogScriptUrl?: string;
	liveReloadUrl?: string;
	hosts: CepHost[];
	panels: CepPanel[];
	dialogs?: CepDialog[];
};

const createHostListXml = (hosts: CepHost[]) =>
	hosts
		.map(
			(host) =>
				`      <Host Name="${host.code}" Version="${host.versionRange}" />`,
		)
		.join("\n");

const createDebugHostListXml = (hosts: CepHost[]) =>
	hosts
		.map((host) => `      <Host Name="${host.code}" Port="${host.debugPort}"/>`)
		.join("\n");

const escapeXmlMenuText = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

const escapeHtmlPlainText = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const createExtensionListXml = (
	panels: CepPanel[],
	dialogs: CepDialog[],
	version: string,
) => {
	const byId = new Map<string, CepPanel | CepDialog>();
	for (const surface of [...panels, ...dialogs]) {
		if (!byId.has(surface.extensionId)) byId.set(surface.extensionId, surface);
	}
	return [...byId.values()]
		.map(
			(surface) =>
				`    <Extension Id="${surface.extensionId}" Version="${version}" />`,
		)
		.join("\n");
};

/** All workspace Panel Extensions share the same HTML (legacy bolt / Motion Tools pattern). Using a separate file per surface can cause AE auxiliary panes to go blank. */
const CEP_SHARED_PANEL_MAIN_PATH = "./panel/index.html";

/** Same family as `reference/bolt-cep/cep.config.ts` parameters. */
const CEP_PANEL_CEF_PARAMETERS = [
	"--v=0",
	"--enable-nodejs",
	"--mixed-context",
] as const;

const createDispatchInfoXml = (panels: CepPanel[]) =>
	panels
		.map((panel) => {
			const autoVisible = panel.autoVisible === false ? "false" : "true";
			const gw = panel.panelGeometry?.width ?? 420;
			const gh = panel.panelGeometry?.height ?? 560;
			const cefParams = CEP_PANEL_CEF_PARAMETERS.map(
				(p) => `            <Parameter>${p}</Parameter>`,
			).join("\n");
			return `    <Extension Id="${panel.extensionId}">
      <DispatchInfo>
        <Resources>
          <MainPath>${CEP_SHARED_PANEL_MAIN_PATH}</MainPath>
          <CEFCommandLine>
${cefParams}
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>${autoVisible}</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>${escapeXmlMenuText(panel.panelDisplayName)}</Menu>
          <Geometry>
            <Size>
              <Width>${gw}</Width>
              <Height>${gh}</Height>
            </Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>`;
		})
		.join("\n");

const createDebugExtensionXml = (panels: CepPanel[], hosts: CepHost[]) =>
	panels
		.map(
			(panel) => `  <Extension Id="${panel.extensionId}">
    <HostList>
${createDebugHostListXml(hosts)}
    </HostList>
  </Extension>`,
		)
		.join("\n");

const dialogDispatchBlock = (
	dialog: CepDialog,
	uiType: "Modeless" | "Panel",
	menuXml: string,
) => {
	const minXml =
		dialog.minSize !== undefined
			? `
            <MinSize>
              <Width>${dialog.minSize.width}</Width>
              <Height>${dialog.minSize.height}</Height>
            </MinSize>`
			: "";
	const maxXml =
		dialog.maxSize !== undefined
			? `
            <MaxSize>
              <Width>${dialog.maxSize.width}</Width>
              <Height>${dialog.maxSize.height}</Height>
            </MaxSize>`
			: "";
	return `    <Extension Id="${dialog.extensionId}">
      <DispatchInfo>
        <Resources>
          <MainPath>./dialog/${dialog.surfaceId}.html</MainPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>false</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>${uiType}</Type>${menuXml}
          <Geometry>
            <Size>
              <Width>${dialog.width}</Width>
              <Height>${dialog.height}</Height>
            </Size>${minXml}${maxXml}
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>`;
};

const createDialogDispatchInfoXml = (dialogs: CepDialog[]) => {
	const byId = new Map<string, CepDialog>();
	for (const dialog of dialogs) {
		if (!byId.has(dialog.extensionId)) byId.set(dialog.extensionId, dialog);
	}
	return [...byId.values()]
		.map((dialog) => {
			const menuXml = dialog.emptyMenu
				? "\n          <Menu></Menu>"
				: (() => {
						const menuLabel =
							dialog.dialogDisplayName.trim() ||
							dialog.surfaceId.replace(/-/g, " ");
						return `\n          <Menu>${escapeXmlMenuText(menuLabel)}</Menu>`;
					})();
			const kind = dialog.uiKind ?? "modeless";
			if (kind === "panel") {
				return dialogDispatchBlock(dialog, "Panel", menuXml);
			}
			return dialogDispatchBlock(dialog, "Modeless", menuXml);
		})
		.join("\n");
};

const createDialogDebugExtensionXml = (
	dialogs: CepDialog[],
	hosts: CepHost[],
) =>
	dialogs
		.map(
			(dialog) => `  <Extension Id="${dialog.extensionId}">
    <HostList>
${createDebugHostListXml(hosts)}
    </HostList>
  </Extension>`,
		)
		.join("\n");

export const createCepBundleArtifacts = ({
	bundleId,
	extensionName,
	version,
	scriptRelativePath,
	liveScriptUrl,
	liveDialogScriptUrl,
	liveReloadUrl,
	hosts,
	panels,
	dialogs = [],
}: CreateCepBundleArtifactsOptions) => {
	const scriptSource = liveScriptUrl ?? scriptRelativePath;
	const liveServerOrigin = liveScriptUrl ? new URL(liveScriptUrl).origin : "";
	const dialogScriptSource =
		liveDialogScriptUrl ??
		(liveServerOrigin ? `${liveServerOrigin}/dialog.js` : "./dialog.js");
	const resolveDialogModuleScript = (dialog: CepDialog): string => {
		if (dialog.moduleScriptRelative) {
			const rel = dialog.moduleScriptRelative.replace(/^\.\//, "");
			if (liveServerOrigin) {
				return `${liveServerOrigin}/${rel}`;
			}
			return dialog.moduleScriptRelative.startsWith("./")
				? dialog.moduleScriptRelative
				: `./${dialog.moduleScriptRelative}`;
		}
		return dialogScriptSource;
	};
	const liveReloadClient = liveReloadUrl
		? `
    <script>
      const reloadSource = new EventSource("${liveReloadUrl}");
      reloadSource.addEventListener("reload", () => {
        location.reload();
      });
    </script>`
		: "";
	/**
	 * Single-entry HTML. Any Extension Id restores `panel-1` ... `panel-5` via CSInterface.getExtensionID().
	 * (Inline is placed right after CSInterface.js).
	 * `scriptSource` ESM bundles React (CEP cannot load from CDN).
	 */
	const panelEntryHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtmlPlainText(extensionName)}</title>
    <style>html,body,#app{height:100%;margin:0;overflow:hidden;}</style>
  </head>
  <body>
    <div id="app"></div>
    <div id="__ty_debug" style="position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow:auto;background:rgba(0,0,0,.85);color:#f66;font:11px/1.4 monospace;padding:8px;display:none;z-index:99999;white-space:pre-wrap;word-break:break-all;"></div>
    <script>
(function(){
  var dbg=document.getElementById("__ty_debug");
  var errs=[];
  window.__ty_errs=errs;
  window.onerror=function(msg,url,line,col,err){errs.push(msg+" (L"+line+":"+col+")");dbg.style.display="block";dbg.textContent=errs.join("\\n");};
  window.addEventListener("unhandledrejection",function(e){var m=e.reason&&e.reason.message||String(e.reason);errs.push("Promise: "+m);dbg.style.display="block";dbg.textContent=errs.join("\\n");});
})();
    </script>
    <script src="../lib/CSInterface.js"></script>
    <script>
(function () {
  window.__TY_PLUS_LIVE_SERVER_ORIGIN__ = "${liveServerOrigin}";
  try {
    if (typeof CSInterface !== "undefined") {
      var ext = new CSInterface().getExtensionID();
      var mDot = /^app\\.ty-plus\\.panel\\.(\\d+)$/i.exec(ext || "");
      var mCompact = /^app\\.ty-plus\\.panel(\\d+)$/i.exec(ext || "");
      var m = mDot || mCompact;
      if (m) window.__TY_PLUS_PANEL_SURFACE_ID__ = "panel-" + m[1];
    }
  } catch (e) {}
})();
    </script>
    <script src="${scriptSource}"></script>${liveReloadClient}
  </body>
</html>
`;
	const createDialogHtml = (
		surfaceId: string,
		htmlTitle: string,
		moduleScriptSrc: string,
	) =>
		`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtmlPlainText(htmlTitle)}</title>
    <style>html,body,#app{height:100%;margin:0;overflow:hidden;}</style>
  </head>
  <body>
    <div id="app"></div>
    <div id="__ty_debug" style="position:fixed;bottom:0;left:0;right:0;max-height:40vh;overflow:auto;background:rgba(0,0,0,.85);color:#f66;font:11px/1.4 monospace;padding:8px;display:none;z-index:99999;white-space:pre-wrap;word-break:break-all;"></div>
    <script>
(function(){
  var dbg=document.getElementById("__ty_debug");
  var errs=[];
  window.__ty_errs=errs;
  window.onerror=function(msg,url,line,col,err){errs.push(msg+" (L"+line+":"+col+")");dbg.style.display="block";dbg.textContent=errs.join("\\n");};
  window.addEventListener("unhandledrejection",function(e){var m=e.reason&&e.reason.message||String(e.reason);errs.push("Promise: "+m);dbg.style.display="block";dbg.textContent=errs.join("\\n");});
})();
    </script>
    <script>
      window.__TY_PLUS_DIALOG_SURFACE_ID__ = "${surfaceId}";
      window.__TY_PLUS_LIVE_SERVER_ORIGIN__ = "${liveServerOrigin}";
    </script>
    <script src="../lib/CSInterface.js"></script>
    <script src="${moduleScriptSrc}"></script>${liveReloadClient}
  </body>
</html>
`;

	return {
		manifestXml: `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<ExtensionManifest
  Version="7.0"
  ExtensionBundleId="${bundleId}"
  ExtensionBundleVersion="${version}"
  ExtensionBundleName="${extensionName}">
  <ExtensionList>
${createExtensionListXml(panels, dialogs, version)}
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
${createHostListXml(hosts)}
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="11.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
${createDispatchInfoXml(panels)}
${dialogs.length > 0 ? `\n${createDialogDispatchInfoXml(dialogs)}` : ""}
  </DispatchInfoList>
</ExtensionManifest>
`,
		debugXml: `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
${createDebugExtensionXml(panels, hosts)}
${dialogs.length > 0 ? `\n${createDialogDebugExtensionXml(dialogs, hosts)}` : ""}
</ExtensionList>
`,
		panelEntryHtml,
		/** @deprecated Compatibility alias. Always identical to `panelEntryHtml`. */
		panelHtml: panelEntryHtml,
		dialogHtmlBySurface: Object.fromEntries(
			dialogs.map((dialog) => [
				dialog.surfaceId,
				createDialogHtml(
					dialog.surfaceId,
					dialog.dialogDisplayName.trim(),
					resolveDialogModuleScript(dialog),
				),
			]),
		),
	};
};

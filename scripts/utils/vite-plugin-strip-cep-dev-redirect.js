import fs from "node:fs";
import path from "node:path";

const CEP_DEV_REDIRECT_SCRIPT_RE =
	/<script>\s*window\.location\.href\s*=\s*['"](http:\/\/(?:localhost|127\.0\.0\.1):\d+\/[^'"]+)['"];\s*<\/script>/g;
/** Paths under `dist/<cepDist>/` where Vite writes CEP shell HTML (see `cep.config.ts` mainPath). */
const CEP_TARGET_HTMLS = ["panel/index.html", "modeless/index.html"];

const CEP_VENDOR_FILES = [
	{
		src: "src/management/ae/cep/vendor/CSInterface.js",
		dest: "vendor/CSInterface.js",
	},
];

function copyCepVendorFiles(distRoot) {
	for (const file of CEP_VENDOR_FILES) {
		const srcPath = path.join(process.cwd(), file.src);
		if (!fs.existsSync(srcPath)) continue;
		const destPath = path.join(distRoot, file.dest);
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		fs.copyFileSync(srcPath, destPath);
	}
}

export function stripCepDevRedirect(html) {
	return html.replace(CEP_DEV_REDIRECT_SCRIPT_RE, "");
}
function resolveDataMainFromHtmlPath(src, htmlRelativePath = "") {
	const normalizedSrc = src.replace(/\\/g, "/");
	const basename = path.posix.basename(normalizedSrc);
	if (!basename || !/^(?:[^/]+)\.(?:cjs|js)$/.test(basename)) {
		return src;
	}
	if (!normalizedSrc.includes("/assets/")) {
		return src;
	}
	const htmlDir = path.posix.dirname(htmlRelativePath.replace(/\\/g, "/"));
	// HTML is e.g. `panel/index.html`; script src is `../assets/js/...cjs`.
	// Resolve relative to the HTML directory (do not assume a flat `assets/` root).
	const joined = path.posix.normalize(path.posix.join(htmlDir, normalizedSrc));
	const relative = path.posix.relative(htmlDir, joined);
	if (!relative || relative.startsWith("..")) {
		return normalizedSrc;
	}
	return relative.startsWith(".") ? relative : `./${relative}`;
}

export function addDataMainToScripts(html, htmlRelativePath = "") {
	return html.replace(
		/<script src="([^"]+\.(?:cjs|js))"([^>]*)><\/script>/g,
		(match, src, attrs) => {
			const normalizedSrc = src.replace(/\\/g, "/");
			if (!normalizedSrc.includes("/assets/")) {
				return match;
			}
			return `<script data-main="${resolveDataMainFromHtmlPath(src, htmlRelativePath)}"${attrs.replace(/\s*src="[^"]*"/, "")}></script>`;
		},
	);
}

/**
 * Rewrite `src` attributes whose target is no longer at the same relative depth
 * after we move the HTML from its source-mirrored path to the shallow
 * `<distRoot>/<leaf>/index.html` location. Today the only such asset is
 * `vendor/CSInterface.js`: from the source shell HTML the path is
 * `../../vendor/CSInterface.js` (two levels up), but from the moved HTML the
 * path is `../vendor/CSInterface.js` (one level up).
 */
export function rewriteShellHtmlAssetPaths(html, htmlRelativePath = "") {
	const segments = htmlRelativePath.split(/[\\/]/).filter(Boolean);
	if (segments.length < 2) return html;
	// We only move HTML files that were deeper than 1 segment under distRoot.
	// For those, every `../` beyond the first is "extra" relative depth.
	const extraDepth = segments.length - 1;
	if (extraDepth <= 0) return html;
	const slashCount = (relative) => (relative.match(/\.\.\//g) || []).length;
	return html.replace(
		/(<script[^>]*\s)src="((?:\.\.\/)+[^"]+)"([^>]*>)/g,
		(match, prefix, src, suffix) => {
			const normalizedSrc = src.replace(/\\/g, "/");
			const depth = slashCount(normalizedSrc);
			if (depth <= extraDepth) return match;
			// Drop the leading `../` once per extra depth level.
			const trimmed = normalizedSrc.replace(
				new RegExp(`^(?:\\.\\./){${extraDepth}}`),
				"",
			);
			return `${prefix}src="${trimmed}"${suffix}`;
		},
	);
}

/** Vite HTML output can disagree with final Rollup `entryFileNames`; sync `data-main` to the file that exists on disk. */
function escapeForRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveShellEntryFilename(distRoot, entryBase) {
	const jsDir = path.join(distRoot, "assets", "js");
	if (!fs.existsSync(jsDir)) return null;
	const files = fs.readdirSync(jsDir);
	const exact = `${entryBase}.entry.cjs`;
	if (files.includes(exact)) return exact;
	const re = new RegExp(
		`^${escapeForRegExp(entryBase)}\\.entry\\.[a-zA-Z0-9_-]+\\.cjs$`,
	);
	const hashed = files.filter((f) => re.test(f));
	return hashed.sort()[0] ?? null;
}

function alignCepShellEntryDataMain(html, distRoot, entryBase) {
	const filename = resolveShellEntryFilename(distRoot, entryBase);
	if (!filename) return html;
	const rel = path.posix.join("..", "assets", "js", filename);
	const escaped = escapeForRegExp(entryBase);
	return html.replace(
		new RegExp(
			`(data-main=["'])\\.\\./assets/js/${escaped}\\.entry\\.[^"']+\\.cjs(["'])`,
			"g",
		),
		`$1${rel}$2`,
	);
}

function createIsolatedRequireScript() {
	return `<script>"use strict";
window.require = function (document) {
  var modules = {};
  function loadStyles() {
    var tmpStyles = document.querySelector("script[data-styles]");
    var styles = tmpStyles && tmpStyles.dataset ? tmpStyles.dataset.styles : "";
    if (typeof styles !== "string" || styles.trim().length === 0) return;
    var head = document.head || document.getElementsByTagName("head")[0];
    styles.split(/,[ ]*/g).forEach(function (url) {
      url = typeof url === "string" ? url.trim() : "";
      if (!url) return;
      var tag = document.createElement("link");
      tag.setAttribute("rel", "stylesheet");
      tag.setAttribute("type", "text/css");
      tag.setAttribute("href", url);
      head.appendChild(tag);
    });
  }
  function showError(error, resolvedPath) {
    var debug = document.getElementById("__ty_debug");
    if (!debug) {
      debug = document.createElement("pre");
      debug.id = "__ty_debug";
      document.documentElement.appendChild(debug);
    }
    debug.textContent = "[ty-plus] CEP entry load failed: " + (error && error.stack ? error.stack : String(error)) + "\\nmain: " + resolvedPath;
  }
  function getSyncText(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    try {
      xhr.send();
    } catch (e) {
      var hint = (e && e.message) ? String(e.message) : String(e);
      throw new Error("XHR failed for " + url + " (" + hint + "). If the path looks correct, re-copy the full extension folder after build; check the file exists and is not blocked by antivirus.");
    }
    if (xhr.status === 200 || xhr.status === 0) return xhr.responseText;
    throw new Error("Failed to load " + url + " (status " + xhr.status + ")");
  }
  function getFileName(filePath) {
    filePath = typeof filePath === "string" ? filePath : "";
    if (filePath.indexOf(".") < 0) {
      try {
        var pack = JSON.parse(getSyncText(new URL(filePath.replace(/\\/$/, "") + "/package.json", location.href).href));
        filePath = filePath.replace(/\\/$/, "") + "/" + pack.main;
      } catch (_error) {}
    }
    return filePath;
  }
  function requireFrom(dirname, file) {
    file = typeof file === "string" ? file.trim() : "";
    var uri = new URL(file, dirname);
    uri.pathname = getFileName(uri.pathname);
    var href = uri.href;
    if (Object.prototype.hasOwnProperty.call(modules, href)) return modules[href];
    var nextDir = href.slice(0, href.lastIndexOf("/") + 1);
    var filename = uri.pathname.slice(uri.pathname.lastIndexOf("/") + 1);
    if (/(.json)$/i.test(filename)) {
      modules[href] = JSON.parse(getSyncText(href));
      return modules[href];
    }
    var module = { exports: {} };
    modules[href] = module.exports;
    var source = getSyncText(href);
    new Function("exports", "require", "module", "__filename", "__dirname", source + "\\n//# sourceURL=" + href).call(window, module.exports, requireFrom.bind(window, nextDir), module, filename, nextDir);
    modules[href] = module.exports;
    return module.exports;
  }
  Object.defineProperty(requireFrom, "modules", { set: Function.prototype, get: function () { return modules; } });
  var baseDir = new URL("./", location.href).href;
  var req = requireFrom.bind(window, baseDir);
  loadStyles();
  function boot() {
    var tmp = document.querySelector("script[data-main]");
    if (!tmp || !tmp.dataset || !tmp.dataset.main) return false;
    if (window.__TY_PLUS_ENTRY_BOOTED__) return true;
    window.__TY_PLUS_ENTRY_BOOTED__ = true;
    var mainUrl = new URL(tmp.dataset.main, baseDir).href;
    try {
      req(tmp.dataset.main);
      return true;
    } catch (error) {
      window.__TY_PLUS_ENTRY_BOOTED__ = false;
      showError(error, mainUrl);
      throw error;
    }
  }
  if (!boot()) {
    var tryLater = function () {
      try {
        if (boot()) {
          document.removeEventListener("DOMContentLoaded", tryLater);
          window.removeEventListener("load", tryLater);
        }
      } catch (_error) {}
    };
    document.addEventListener("DOMContentLoaded", tryLater);
    window.addEventListener("load", tryLater);
  }
  return req;
}(document);
</script>`;
}

export function patchCepNativeRequireMainPath(html) {
	const injectedRequireRe =
		/<script>"use strict";\s*window\.require =[\s\S]*?<\/script>/;
	if (injectedRequireRe.test(html)) {
		return html.replace(injectedRequireRe, createIsolatedRequireScript());
	}
	const patchBody = `var _tyPlusLoadMain = function(_tyPlusTmp) {
    if (!_tyPlusTmp || !_tyPlusTmp.dataset || !_tyPlusTmp.dataset.main) return false;
    var _tyPlusMainPath = _tyPlusTmp.dataset.main;
    try {
      if (typeof cep_node !== "undefined" && cep_node && cep_node.require && cep_node.global && cep_node.global["__dir"+"name"]) {
        var _tyPlusPath = cep_node.require("path");
        var _tyPlusBaseDir = cep_node.global["__dir"+"name"];
        try {
          if (typeof location !== "undefined" && location && typeof location.pathname === "string" && location.pathname.length > 0) {
            var _tyPlusDecodedPath = decodeURIComponent(location.pathname);
            if (/^\\/[A-Za-z]:\\//.test(_tyPlusDecodedPath)) {
              _tyPlusDecodedPath = _tyPlusDecodedPath.slice(1);
            }
            _tyPlusBaseDir = _tyPlusPath.dirname(_tyPlusDecodedPath);
          }
        } catch (_tyPlusPathErr) {}
        _tyPlusMainPath = _tyPlusPath.resolve(_tyPlusBaseDir, _tyPlusMainPath);
      }
    } catch (_tyPlusErr) {}
    if (window.__TY_PLUS_ENTRY_BOOTED__) return true;
    window.__TY_PLUS_ENTRY_BOOTED__ = true;
    try {
      require(_tyPlusMainPath);
      return true;
    } catch (_tyPlusRequireErr) {
      window.__TY_PLUS_ENTRY_BOOTED__ = false;
      var _tyPlusDebug = document.getElementById("__ty_debug");
      if (!_tyPlusDebug) {
        _tyPlusDebug = document.createElement("pre");
        _tyPlusDebug.id = "__ty_debug";
        document.documentElement.appendChild(_tyPlusDebug);
      }
      _tyPlusDebug.textContent = "[ty-plus] CEP entry load failed: " + (_tyPlusRequireErr && _tyPlusRequireErr.stack ? _tyPlusRequireErr.stack : String(_tyPlusRequireErr)) + "\\nmain: " + _tyPlusMainPath;
      throw _tyPlusRequireErr;
    }
    };
    var _tyPlusLoaded = _tyPlusLoadMain(tmp);
    if (!_tyPlusLoaded) {
      var _tyPlusTryLater = function() {
        try {
          var _tyPlusLateTmp = document.querySelector("script[data-main]");
          if (_tyPlusLoadMain(_tyPlusLateTmp)) {
            _tyPlusLoaded = true;
            document.removeEventListener("DOMContentLoaded", _tyPlusTryLater);
            window.removeEventListener("load", _tyPlusTryLater);
          }
        } catch (_tyPlusLateErr) {}
      };
      _tyPlusTryLater();
      if (!_tyPlusLoaded) {
        document.addEventListener("DOMContentLoaded", _tyPlusTryLater);
        window.addEventListener("load", _tyPlusTryLater);
      }
    }`;
	const guardedRequireRe =
		/if\s*\(\s*tmp\s*\)\s*\{\s*require\(tmp\.dataset\.main\);\s*\}/;
	if (guardedRequireRe.test(html)) {
		return html.replace(guardedRequireRe, patchBody);
	}
	return html.replace("require(tmp.dataset.main);", patchBody);
}
export function rewriteCepDevRedirect(html, options = {}) {
	const host = (options.host ?? "").trim();
	if (host.length === 0) return html;
	return html.replace(CEP_DEV_REDIRECT_SCRIPT_RE, (fullMatch, rawUrl) => {
		try {
			const url = new URL(rawUrl);
			if (url.protocol !== "http:") return fullMatch;
			if (url.hostname !== "localhost") return fullMatch;
			url.hostname = host;
			return fullMatch.replace(rawUrl, url.toString());
		} catch {
			return fullMatch;
		}
	});
}
export function ensureCepDevRedirect(html, options = {}) {
	const host = (options.host ?? "").trim();
	const pagePath = (options.pagePath ?? "").trim();
	const port = options.port ?? 3000;
	if (!host || !pagePath) return html;
	const redirectUrl = `http://${host}:${port}/${pagePath.replace(/^\/+/, "")}`;
	const script = `<script>\n      window.location.href = '${redirectUrl}';\n    </script>`;
	if (CEP_DEV_REDIRECT_SCRIPT_RE.test(html)) {
		CEP_DEV_REDIRECT_SCRIPT_RE.lastIndex = 0;
		return rewriteCepDevRedirect(html, { host });
	}
	CEP_DEV_REDIRECT_SCRIPT_RE.lastIndex = 0;
	if (!html.includes("</body>")) {
		return `${html}\n${script}\n`;
	}
	return html.replace("</body>", `    ${script}\n  </body>`);
}
function processRedirectTargets(cepDist, updater) {
	const distRoot = path.join(process.cwd(), "dist", cepDist);
	if (!fs.existsSync(distRoot)) return { changed: 0 };
	let changed = 0;
	const targets = CEP_TARGET_HTMLS.map((relativePath) =>
		path.join(distRoot, relativePath),
	);
	for (const filePath of targets) {
		if (!fs.existsSync(filePath)) continue;
		const before = fs.readFileSync(filePath, "utf8");
		const after = updater(before);
		if (after !== before) {
			fs.writeFileSync(filePath, after, "utf8");
			changed++;
		}
	}
	return { changed };
}
function resolveCssAssetList(distRoot, htmlRelativePath) {
	const cssDir = path.join(distRoot, "assets", "css");
	const htmlDir = path.posix.dirname(htmlRelativePath.replace(/\\/g, "/"));
	const styles = [];
	const shellCss = path.join(distRoot, "cep-shell.bundle.css");
	if (fs.existsSync(shellCss)) {
		styles.push("cep-shell.bundle.css");
	}
	if (fs.existsSync(cssDir)) {
		styles.push(
			...fs
				.readdirSync(cssDir)
				.filter((file) => file.endsWith(".css"))
				.sort()
				.map((file) => path.posix.join("assets", "css", file)),
		);
	}
	return styles
		.map((absoluteLike) => {
			const relative = path.posix.relative(htmlDir, absoluteLike);
			return relative.startsWith(".") ? relative : `./${relative}`;
		})
		.join(",");
}
function addDataStylesScript(html, distRoot, htmlRelativePath) {
	const styles = resolveCssAssetList(distRoot, htmlRelativePath);
	if (!styles) return html;
	const script = `<script data-styles="${styles}"></script>`;
	if (/<script\s+data-styles=/.test(html)) {
		return html.replace(/<script\s+data-styles="[^"]*"><\/script>/, script);
	}
	if (html.includes("</head>")) {
		return html.replace("</head>", `\t\t${script}\n\t</head>`);
	}
	if (html.includes("</body>")) {
		return html.replace("</body>", `\t\t${script}\n\t</body>`);
	}
	return `${html}\n${script}\n`;
}
export function stripCepDevRedirectPlugin(opts = {}) {
	const cepDist = opts.cepDist ?? "cep";
	return {
		name: "typlus-strip-cep-dev-redirect",
		apply: "build",
		enforce: "post",
		closeBundle() {
			processRedirectTargets(cepDist, stripCepDevRedirect);
		},
	};
}
/**
 * Add data-main attribute to script tags for CEP CommonJS module loading.
 * CEP's require polyfill uses data-main to load the entry point.
 * Must run BEFORE vite-cep-plugin's writeBundle (which creates ZXP).
 *
 * `vite-cep-plugin` writes each panel/modeless HTML to a path that mirrors
 * the source location (e.g. `dist/cep-dev/management/ae/cep/shell/panel/index.html`).
 * The CEP `MainPath` in `cep.config.ts` and the `addDataStylesScript` injection
 * both expect the shallow path (`dist/cep-dev/panel/index.html`). We therefore
 * move the HTML to the shallow location AND apply the data-main/data-styles
 * rewrites there. Source paths and shallow targets stay in sync via
 * `CEP_TARGET_HTMLS`.
 */
export function addDataMainToScriptsPlugin(opts = {}) {
	const cepDist = opts.cepDist ?? "cep";
	return {
		name: "typlus-add-data-main",
		apply: "build",
		enforce: "post",
		closeBundle() {
			const distRoot = path.join(process.cwd(), "dist", cepDist);
			if (!fs.existsSync(distRoot)) return;
			copyCepVendorFiles(distRoot);
			for (const relativePath of CEP_TARGET_HTMLS) {
				const shallowPath = path.join(distRoot, relativePath);
				const sourcePath = findCepHtmlSource(distRoot, relativePath);
				if (!sourcePath) continue;
				if (sourcePath !== shallowPath) {
					fs.mkdirSync(path.dirname(shallowPath), { recursive: true });
					const html = fs.readFileSync(sourcePath, "utf8");
					fs.writeFileSync(shallowPath, html, "utf8");
					fs.unlinkSync(sourcePath);
				}
				if (!fs.existsSync(shallowPath)) continue;
				const before = fs.readFileSync(shallowPath, "utf8");
				// Convert <script src="../assets/panel-XXX.js"></script>
				// (or legacy .cjs) to <script data-main="../assets/panel-XXX.js"></script>
				// The src attribute is removed so the require polyfill handles loading
				const entryBase = path.posix.basename(
					path.posix.dirname(relativePath.replace(/\\/g, "/")),
				);
				const after = patchCepNativeRequireMainPath(
					addDataStylesScript(
						rewriteShellHtmlAssetPaths(
							alignCepShellEntryDataMain(
								addDataMainToScripts(before, relativePath),
								distRoot,
								entryBase,
							),
							relativePath,
						),
						distRoot,
						relativePath,
					),
				);
				if (after !== before) {
					fs.writeFileSync(shallowPath, after, "utf8");
				}
			}
		},
	};
}

/**
 * Locate the HTML that `vite-cep-plugin` wrote for a given CEP target. The
 * plugin emits files at `path.relative(config.root, source)` under
 * `dist/<cepDist>`, so the path mirrors the source layout. Search a small
 * set of likely locations and return the first match, or null.
 */
function findCepHtmlSource(distRoot, relativePath) {
	const base = path.posix.basename(relativePath);
	const segments = relativePath.split(/[\\/]/);
	const leaf = segments[0]; // "panel" or "modeless"
	const candidates = [
		path.join(distRoot, relativePath),
		path.join(distRoot, "management", "ae", "cep", "shell", leaf, base),
		path.join(distRoot, "shell", leaf, base),
		path.join(distRoot, leaf, base),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}
function rewriteCepDevRedirectPlugin(opts = {}) {
	const cepDist = opts.cepDist ?? "cep";
	const host = (opts.host ?? "").trim();
	return {
		name: "typlus-rewrite-cep-dev-redirect",
		apply: "build",
		closeBundle() {
			if (!host) return;
			processRedirectTargets(cepDist, (html) =>
				rewriteCepDevRedirect(html, { host }),
			);
		},
	};
}
export function ensureCepDevRedirectPlugin(opts = {}) {
	const cepDist = opts.cepDist ?? "cep";
	const host = (opts.host ?? "").trim();
	const port = opts.port ?? 3000;
	return {
		name: "typlus-ensure-cep-dev-redirect",
		apply: "build",
		closeBundle() {
			if (!host) return;
			const distRoot = path.join(process.cwd(), "dist", cepDist);
			if (!fs.existsSync(distRoot)) return;
			const targets = CEP_TARGET_HTMLS.map((relativePath) => ({
				relativePath,
				filePath: path.join(distRoot, relativePath),
			}));
			for (const target of targets) {
				if (!fs.existsSync(target.filePath)) continue;
				const before = fs.readFileSync(target.filePath, "utf8");
				const after = ensureCepDevRedirect(before, {
					host,
					port,
					pagePath: target.relativePath,
				});
				if (after !== before) {
					fs.writeFileSync(target.filePath, after, "utf8");
				}
			}
		},
	};
}

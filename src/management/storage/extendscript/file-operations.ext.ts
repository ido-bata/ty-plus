const normalizePathForExtendScript = (path: string): string =>
	path.replace(/\\/g, "/");

// Self-contained ES3 base64 decoder. ExtendScript lacks atob/btoa, so we must
// emit a pure-JS implementation. Each output char is one byte, suitable for
// File.write with `encoding = "BINARY"` (which writes the low byte of each
// char). Whitespace is stripped first so the function tolerates the formatted
// base64 that the host side passes through.
const buildBase64Decoder = (): string =>
	[
		"var __TY_B64__ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';",
		"function __decodeBase64(input) {",
		"  var s = String(input).replace(/[^A-Za-z0-9+\\/=]/g, '');",
		"  var n = s.length;",
		"  var out = '';",
		"  var i = 0;",
		"  while (i < n) {",
		"    var e1 = __TY_B64__.indexOf(s.charAt(i)); i += 1;",
		"    var e2 = __TY_B64__.indexOf(s.charAt(i)); i += 1;",
		"    var e3 = __TY_B64__.indexOf(s.charAt(i)); i += 1;",
		"    var e4 = __TY_B64__.indexOf(s.charAt(i)); i += 1;",
		"    out += String.fromCharCode((e1 << 2) | (e2 >> 4));",
		"    if (s.charAt(i - 2) !== '=') {",
		"      out += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));",
		"    }",
		"    if (s.charAt(i - 1) !== '=') {",
		"      out += String.fromCharCode(((e3 & 3) << 6) | e4);",
		"    }",
		"  }",
		"  return out;",
		"}",
	].join("\n");

export const buildWriteBase64FileScript = (
	filePath: string,
	base64: string,
): string => {
	const normalized = normalizePathForExtendScript(filePath);
	const dir = normalized.replace(/\/[^/]*$/, "") || "/";
	const path = JSON.stringify(normalized);
	const data = JSON.stringify(base64);
	const dirJson = JSON.stringify(dir);
	return [
		"(function() {",
		`  var path = ${path};`,
		`  var data = ${data};`,
		`  var dir = ${dirJson};`,
		buildBase64Decoder(),
		// Decode before writing: BINARY encoding does NOT auto-decode base64.
		"  var decoded = __decodeBase64(data);",
		"  var parts = dir.split('/');",
		"  var current = '';",
		"  for (var i = 0; i < parts.length; i++) {",
		"    var seg = parts[i];",
		"    if (!seg) continue;",
		"    current = (i === 0 && seg.indexOf(':') !== -1) ? seg : (current ? current + '/' + seg : seg);",
		"    var f = new Folder(current);",
		"    if (!f.exists) f.create();",
		"  }",
		"  var file = new File(path);",
		'  if (!file.open("w")) {',
		'    throw new Error("Could not open file for writing: " + path);',
		"  }",
		"  try {",
		'    file.encoding = "BINARY";',
		"    file.write(decoded);",
		"  } finally {",
		"    file.close();",
		"  }",
		// Post-write verification: ExtendScript's File.write returns true on
		// "no exception" but the file may not actually be on disk if the
		// underlying volume rejected the flush. Returning the file's length
		// lets the JS wrapper compare against the requested byte count.
		'  if (!file.exists) throw new Error("File does not exist after write: " + path);',
		"  return String(file.length);",
		"})();",
	].join("\n");
};

export const buildEnsureDirScript = (dirPath: string): string => {
	const path = JSON.stringify(normalizePathForExtendScript(dirPath));
	return [
		"(function() {",
		`  var path = ${path};`,
		"  var folder = new Folder(path);",
		"  if (!folder.exists) {",
		"    folder.create();",
		"  }",
		"})();",
	].join("\n");
};

export const buildEnsureDirScriptWithParents = (dirPath: string): string => {
	const path = JSON.stringify(normalizePathForExtendScript(dirPath));
	return [
		"(function() {",
		`  var path = ${path};`,
		"  var parts = path.split('/');",
		"  var current = '';",
		"  for (var i = 0; i < parts.length; i++) {",
		"    if (parts[i]) {",
		"      current += (current ? '/' : '') + parts[i];",
		"      var f = new Folder(current);",
		"      if (!f.exists) f.create();",
		"    }",
		"  }",
		"})();",
	].join("\n");
};

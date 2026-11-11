/**
 * After Effects ExtendScript strings (single `evalScript` call).
 * Type-checked with `bun run typecheck:extendscript` (`tsconfig.extendscript.json`).
 * No runtime logic here  Estrings only.
 */

/** Active composition JSON (same shape as archive project-info-widget) */
export const ACTIVE_COMP_INFO = `(function(){
  try {
    if (typeof app === "undefined" || !app.project) {
      return JSON.stringify({ error: "no app" });
    }
    if (!app.project.activeItem || !(app.project.activeItem instanceof CompItem)) {
      return JSON.stringify({ error: "No active composition" });
    }
    var comp = app.project.activeItem;
    var info = {
      name: comp.name,
      width: comp.width,
      height: comp.height,
      pixelAspect: comp.pixelAspect,
      duration: comp.duration,
      frameRate: comp.frameRate,
      dropFrame: comp.dropFrame,
      bgColor: comp.bgColor ? [comp.bgColor[0]/255, comp.bgColor[1]/255, comp.bgColor[2]/255] : null,
      layers: comp.numLayers,
      selectedLayers: comp.selectedLayers.length,
      shutterAngle: comp.shutterAngle,
      shutterPhase: comp.shutterPhase,
      motionBlur: comp.motionBlur,
      draft3d: comp.draft3d
    };
    return JSON.stringify({ data: info });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
})()`;

/** Active item JSON summary */
export const ACTIVE_ITEM_SUMMARY = `(function(){
  try {
    if (typeof app === "undefined" || !app.project) {
      return JSON.stringify({ok:false,msg:"no app"});
    }
    var it = app.project.activeItem;
    if (!it) {
      return JSON.stringify({ok:true,name:"",kind:"none"});
    }
    var kind = "item";
    if (it instanceof CompItem) kind = "comp";
    else if (it instanceof FootageItem) kind = "footage";
    return JSON.stringify({ok:true,name:String(it.name),kind:kind});
  } catch (e) {
    return JSON.stringify({ok:false,msg:String(e)});
  }
})()`;

export const TOGGLE_FAUX_BOLD = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    d.fauxBold = !d.fauxBold;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const TOGGLE_FAUX_ITALIC = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    d.fauxItalic = !d.fauxItalic;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const TOGGLE_ALL_CAPS = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    d.allCaps = !d.allCaps;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

/** ParagraphJustification: LEFT=1, RIGHT=2, CENTER=3, FULL=4 */
export const ALIGN_LEFT = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    d.justification = ParagraphJustification.LEFT_JUSTIFY;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const ALIGN_CENTER = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    d.justification = ParagraphJustification.CENTER_JUSTIFY;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const ALIGN_RIGHT = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    d.justification = ParagraphJustification.RIGHT_JUSTIFY;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

/** Changes selected text layer font size by 1pt units */
const FONT_SIZE_DELTA_TEMPLATE = `(function(){
  try {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    if (comp.selectedLayers.length < 1) return "no layer";
    var t = comp.selectedLayers[0];
    if (!(t instanceof TextLayer)) return "not text";
    var p = t.property("Source Text");
    var d = p.value;
    var ns = Math.max(1, d.fontSize + (__DELTA__));
    d.fontSize = ns;
    p.setValue(d);
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const buildFontSizeDeltaScript = (delta: 1 | -1): string =>
	FONT_SIZE_DELTA_TEMPLATE.replace("__DELTA__", String(delta));

export type ActiveItemJson =
	| { ok: true; name: string; kind: string }
	| { ok: false; msg?: string };

/**
 * ExtendScript strings for anchor point operations.
 * Type-checked with `bun run typecheck:extendscript` (`tsconfig.extendscript.json`).
 * No runtime logic here — strings only.
 */

export const ANCHOR_KEYS = [
	"top-left",
	"top-center",
	"top-right",
	"center-left",
	"center",
	"center-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
] as const;

export type AnchorPosition = (typeof ANCHOR_KEYS)[number];

const isValidAnchorPosition = (v: string): v is AnchorPosition =>
	(ANCHOR_KEYS as readonly string[]).indexOf(v) !== -1;

export { isValidAnchorPosition };

const ANCHOR_SCRIPT_TEMPLATE = `(function(){
  function shiftProp(prop, dx, dy) {
    if (typeof prop.numKeys === "undefined") {
      return "not-a-property: type=" + (typeof prop) + " name=" + (prop && prop.name);
    }
    var wasSep = false;
    try { wasSep = !!prop.dimensionsSeparated; } catch (eSep) {}
    if (wasSep) {
      try { prop.dimensionsSeparated = false; } catch (eUnsep) {}
    }
    var result;
    try {
      var numKeys = prop.numKeys;
      if (numKeys > 0) {
        var firstKTime = prop.keyTime(1);
        var firstOld = prop.valueAtTime(firstKTime, false);
        for (var k = 1; k <= numKeys; k++) {
          var kTime = prop.keyTime(k);
          var oldVal = prop.valueAtTime(kTime, false);
          var newVal = oldVal.length === 3
            ? [oldVal[0] + dx, oldVal[1] + dy, oldVal[2]]
            : [oldVal[0] + dx, oldVal[1] + dy];
          prop.setValueAtKey(k, newVal);
        }
        var firstNew = prop.valueAtTime(firstKTime, false);
        result = (wasSep ? "unsep-" : "") + numKeys + "kf first=" + JSON.stringify(firstOld) + "->" + JSON.stringify(firstNew);
      } else {
        var oldVal2 = prop.value;
        var newVal2 = oldVal2.length === 3
          ? [oldVal2[0] + dx, oldVal2[1] + dy, oldVal2[2]]
          : [oldVal2[0] + dx, oldVal2[1] + dy];
        prop.setValue(newVal2);
        result = (wasSep ? "unsep-" : "") + "static " + JSON.stringify(oldVal2) + "->" + JSON.stringify(newVal2);
      }
    } finally {
      if (wasSep) {
        try { prop.dimensionsSeparated = true; } catch (eRe) {}
      }
    }
    return result;
  }

  function showError(scope, err) {
    var detail = scope + ": " + String(err);
    if (err && err.line) detail += " @ line " + err.line;
    $.writeln("[anchor] ERROR " + detail);
    alert("ty-plus anchor error\\n" + detail);
  }

  try {
    var POS = "__POSITION__";
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { alert("ty-plus anchor: no active comp"); return "no comp"; }
    var selected = comp.selectedLayers;
    if (!selected || selected.length < 1) { alert("ty-plus anchor: no layer selected"); return "no layer"; }
    app.beginUndoGroup("ty-plus anchor (anim-safe)");
    var results = [];
    var hadError = false;
    try {
      for (var i = 0; i < selected.length; i++) {
        var layer = selected[i];
        try {
          var transform = layer.property("ADBE Transform Group");
          if (!transform) { results.push(i + ":" + layer.name + ":no-transform"); continue; }
          var anchorProp = transform.property("ADBE Anchor Point");
          var positionProp = transform.property("ADBE Position");
          if (!anchorProp || !positionProp) { results.push(i + ":" + layer.name + ":no-props"); continue; }
          var rect = layer.sourceRectAtTime(comp.time, false);
          var ratioX = 0, ratioY = 0;
          if (POS === "top-left") { ratioX = 0; ratioY = 0; }
          else if (POS === "top-center") { ratioX = 0.5; ratioY = 0; }
          else if (POS === "top-right") { ratioX = 1; ratioY = 0; }
          else if (POS === "center-left") { ratioX = 0; ratioY = 0.5; }
          else if (POS === "center") { ratioX = 0.5; ratioY = 0.5; }
          else if (POS === "center-right") { ratioX = 1; ratioY = 0.5; }
          else if (POS === "bottom-left") { ratioX = 0; ratioY = 1; }
          else if (POS === "bottom-center") { ratioX = 0.5; ratioY = 1; }
          else if (POS === "bottom-right") { ratioX = 1; ratioY = 1; }
          var newAnchorX = rect.left + rect.width * ratioX;
          var newAnchorY = rect.top + rect.height * ratioY;
          var currentAnchor = anchorProp.value;
          var deltaX = newAnchorX - currentAnchor[0];
          var deltaY = newAnchorY - currentAnchor[1];
          var posResult = shiftProp(positionProp, deltaX, deltaY);
          var anchorResult = shiftProp(anchorProp, deltaX, deltaY);
          results.push(i + ":" + layer.name
            + " pos=" + POS
            + " delta=(" + deltaX + "," + deltaY + ")"
            + " p=" + posResult
            + " a=" + anchorResult);
        } catch (layerErr) {
          hadError = true;
          showError("layer " + i + " (" + layer.name + ")", layerErr);
          results.push(i + ":" + layer.name + ":err:" + String(layerErr));
        }
      }
    } finally { app.endUndoGroup(); }
    var finalResult = "ok n=" + selected.length + " " + results.join(" | ");
    if (hadError) alert("ty-plus anchor completed with errors\\n" + finalResult);
    return finalResult;
  } catch (e) {
    showError("top-level", e);
    return "err: " + String(e);
  }
})()`;

export const buildAnchorScript = (position: AnchorPosition): string =>
	ANCHOR_SCRIPT_TEMPLATE.replace("__POSITION__", position);

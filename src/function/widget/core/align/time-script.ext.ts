/**
 * After Effects ExtendScript strings for timeline align/distribute.
 * Type-checked with `bun run typecheck:extendscript` (`tsconfig.extendscript.json`).
 */

export const TIME_ACTIONS: readonly [
	"align-start",
	"align-end",
	"align-duration",
	"distribute-start",
	"distribute-end",
] = [
	"align-start",
	"align-end",
	"align-duration",
	"distribute-start",
	"distribute-end",
];

export type TimeAction = (typeof TIME_ACTIONS)[number];

const TEMPLATE = `(function(){
  try {
    var ACTION = "__ACTION__";
    var COMP_TIME = __COMP_TIME__;
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    var selected = comp.selectedLayers;
    if (!selected || selected.length < 1) return "no layer";
    var dur = comp.duration;
    app.beginUndoGroup("ty-plus time align");
    try {
      if (COMP_TIME && (ACTION === "align-start" || ACTION === "align-end" || ACTION === "align-duration")) {
        if (ACTION === "align-start") {
          for (var i = 0; i < selected.length; i++) selected[i].inPoint = 0;
        } else if (ACTION === "align-end") {
          for (var j = 0; j < selected.length; j++) selected[j].outPoint = dur;
        } else {
          for (var k = 0; k < selected.length; k++) {
            selected[k].inPoint = 0;
            selected[k].outPoint = dur;
          }
        }
      } else if (ACTION === "align-start") {
        var minIn = 1e12;
        for (var tasi = 0; tasi < selected.length; tasi++) {
          var ip = selected[tasi].inPoint;
          if (ip < minIn) minIn = ip;
        }
        if (isFinite(minIn)) {
          for (var tasj = 0; tasj < selected.length; tasj++) {
            var L = selected[tasj];
            var off = minIn - L.inPoint;
            if (off !== 0) L.startTime = L.startTime + off;
          }
        }
      } else if (ACTION === "align-end") {
        var maxOut = -1e12;
        for (var taei = 0; taei < selected.length; taei++) {
          var op = selected[taei].outPoint;
          if (op > maxOut) maxOut = op;
        }
        if (isFinite(maxOut)) {
          for (var taej = 0; taej < selected.length; taej++) {
            var L2 = selected[taej];
            var off2 = maxOut - L2.outPoint;
            if (off2 !== 0) L2.startTime = L2.startTime + off2;
          }
        }
      } else if (ACTION === "align-duration") {
        var refL = selected[0];
        var refDur = refL.outPoint - refL.inPoint;
        for (var tadi = 1; tadi < selected.length; tadi++) {
          var L3 = selected[tadi];
          var ci = L3.inPoint;
          L3.inPoint = ci;
          L3.outPoint = ci + refDur;
        }
      } else if (ACTION === "distribute-start") {
        if (selected.length > 2) {
          var inPts = [];
          for (var tdsi = 0; tdsi < selected.length; tdsi++) inPts.push(selected[tdsi].inPoint);
          inPts.sort(function(a,b){ return a-b; });
          var firstIn = inPts[0];
          var lastIn = inPts[inPts.length - 1];
          var span = lastIn - firstIn;
          var step = span / (inPts.length - 1 || 1);
          for (var tdsj = 0; tdsj < selected.length; tdsj++) {
            var layer = selected[tdsj];
            var targetIn = firstIn + step * tdsj;
            var offset = targetIn - layer.inPoint;
            if (offset !== 0) layer.startTime = layer.startTime + offset;
          }
        }
      } else if (ACTION === "distribute-end") {
        if (selected.length > 2) {
          var outPts = [];
          for (var tdei = 0; tdei < selected.length; tdei++) outPts.push(selected[tdei].outPoint);
          outPts.sort(function(a,b){ return a-b; });
          var firstOut = outPts[0];
          var lastOut = outPts[outPts.length - 1];
          var spanO = lastOut - firstOut;
          var stepO = spanO / (outPts.length - 1 || 1);
          for (var tdej = 0; tdej < selected.length; tdej++) {
            var layerB = selected[tdej];
            var targetOut = firstOut + stepO * tdej;
            var offsetB = targetOut - layerB.outPoint;
            if (offsetB !== 0) layerB.startTime = layerB.startTime + offsetB;
          }
        }
      }
    } finally { app.endUndoGroup(); }
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const buildScriptFromTemplate = (
	action: string,
	compTime: boolean,
): string =>
	TEMPLATE.replace("__ACTION__", action).replace(
		"__COMP_TIME__",
		compTime ? "true" : "false",
	);

/**
 * ExtendScript strings for layer align/distribute operations.
 * Type-checked with `bun run typecheck:extendscript` (`tsconfig.extendscript.json`).
 * No runtime logic here  Estrings only.
 */

export const ACTIONS: readonly [
	"align-left",
	"align-center-h",
	"align-right",
	"align-top",
	"align-center-v",
	"align-bottom",
	"distribute-left",
	"distribute-center-h",
	"distribute-right",
	"distribute-top",
	"distribute-center-v",
	"distribute-bottom",
	"distribute-spacing-h",
	"distribute-spacing-v",
	"distribute-h",
	"distribute-v",
] = [
	"align-left",
	"align-center-h",
	"align-right",
	"align-top",
	"align-center-v",
	"align-bottom",
	"distribute-left",
	"distribute-center-h",
	"distribute-right",
	"distribute-top",
	"distribute-center-v",
	"distribute-bottom",
	"distribute-spacing-h",
	"distribute-spacing-v",
	"distribute-h",
	"distribute-v",
];

export type Action = (typeof ACTIONS)[number];

const TEMPLATE = `(function(){
  try {
    var ACTION = "__ACTION__";
    var COMP_TARGET = __COMP_TARGET__;
    var KEY_TARGET = __KEY_TARGET__;
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) return "no comp";
    var selected = comp.selectedLayers;
    if (!selected || selected.length < 1) return "no layer";

    var getLayerBounds = function(layer, time) {
      var rect = layer.sourceRectAtTime(time, false);
      if (typeof layer.toComp === "function") {
        var p1 = layer.toComp([rect.left, rect.top, 0]);
        var p2 = layer.toComp([rect.left + rect.width, rect.top, 0]);
        var p3 = layer.toComp([rect.left, rect.top + rect.height, 0]);
        var p4 = layer.toComp([rect.left + rect.width, rect.top + rect.height, 0]);
        var pts = [p1, p2, p3, p4];
        var minX = 1e12;
        var minY = 1e12;
        var maxX = -1e12;
        var maxY = -1e12;
        for (var i = 0; i < pts.length; i++) {
          if (pts[i][0] < minX) minX = pts[i][0];
          if (pts[i][1] < minY) minY = pts[i][1];
          if (pts[i][0] > maxX) maxX = pts[i][0];
          if (pts[i][1] > maxY) maxY = pts[i][1];
        }
        return {
          left: minX,
          top: minY,
          right: maxX,
          bottom: maxY,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2
        };
      }
      var transform = layer.property("ADBE Transform Group");
      var position = transform ? transform.property("ADBE Position").value : [0, 0];
      var anchor = transform ? transform.property("ADBE Anchor Point").value : [0, 0];
      var scale = transform ? transform.property("ADBE Scale").value : [100, 100];
      var scaleX = scale[0] / 100;
      var scaleY = scale[1] / 100;
      var width = rect.width * scaleX;
      var height = rect.height * scaleY;
      var left = position[0] + (rect.left - anchor[0]) * scaleX;
      var top = position[1] + (rect.top - anchor[1]) * scaleY;
      return {
        left: left,
        top: top,
        right: left + width,
        bottom: top + height,
        centerX: left + width / 2,
        centerY: top + height / 2
      };
    };

    var applyDelta = function(layer, dx, dy) {
      var transform = layer.property("ADBE Transform Group");
      if (!transform) return;
      var pos = transform.property("ADBE Position");
      if (!pos) return;
      var value = pos.value;
      var dpX = dx;
      var dpY = dy;
      try {
        var currentPosComp = layer.toComp(value);
        var targetPosLocal = layer.fromComp([currentPosComp[0] + dx, currentPosComp[1] + dy]);
        dpX = targetPosLocal[0] - value[0];
        dpY = targetPosLocal[1] - value[1];
      } catch (e) {}
      var next = value.length === 3
        ? [value[0] + dpX, value[1] + dpY, value[2]]
        : [value[0] + dpX, value[1] + dpY];
      if (pos.numKeys > 0 && layer.containingComp) {
        pos.setValueAtTime(layer.containingComp.time, next);
        return;
      }
      pos.setValue(next);
    };

    var makeIndexed = function(bounds) {
      var out = [];
      for (var i = 0; i < bounds.length; i++) out.push({ idx: i, b: bounds[i] });
      return out;
    };

    var bounds = [];
    var minLeft = 1e12;
    var maxRight = -1e12;
    var minTop = 1e12;
    var maxBottom = -1e12;
    for (var bi = 0; bi < selected.length; bi++) {
      var b = getLayerBounds(selected[bi], comp.time);
      bounds.push(b);
      if (b.left < minLeft) minLeft = b.left;
      if (b.right > maxRight) maxRight = b.right;
      if (b.top < minTop) minTop = b.top;
      if (b.bottom > maxBottom) maxBottom = b.bottom;
    }

    if (COMP_TARGET) {
      minLeft = 0;
      maxRight = comp.width;
      minTop = 0;
      maxBottom = comp.height;
    } else if (KEY_TARGET && selected.length >= 2) {
      minLeft = bounds[0].left;
      maxRight = bounds[0].right;
      minTop = bounds[0].top;
      maxBottom = bounds[0].bottom;
    }

    var centerX = (minLeft + maxRight) / 2;
    var centerY = (minTop + maxBottom) / 2;

    app.beginUndoGroup("ty-plus align");
    try {
      if (ACTION === "distribute-h" || ACTION === "distribute-v") {
        var distribute = makeIndexed(bounds);
        if (distribute.length <= 2) return "ok";
        if (ACTION === "distribute-h") {
          distribute.sort(function(a, b) { return a.b.centerX - b.b.centerX; });
          var start = distribute[0].b.centerX;
          var end = distribute[distribute.length - 1].b.centerX;
          var step = (end - start) / (distribute.length - 1);
          for (var dhi = 0; dhi < distribute.length; dhi++) {
            applyDelta(selected[distribute[dhi].idx], start + step * dhi - distribute[dhi].b.centerX, 0);
          }
        } else {
          distribute.sort(function(a, b) { return a.b.centerY - b.b.centerY; });
          var startY = distribute[0].b.centerY;
          var endY = distribute[distribute.length - 1].b.centerY;
          var stepY = (endY - startY) / (distribute.length - 1);
          for (var dvi = 0; dvi < distribute.length; dvi++) {
            applyDelta(selected[distribute[dvi].idx], 0, startY + stepY * dvi - distribute[dvi].b.centerY);
          }
        }
        return "ok";
      }

      if (ACTION === "distribute-spacing-h" || ACTION === "distribute-spacing-v") {
        var spacing = makeIndexed(bounds);
        if (spacing.length <= 2) return "ok";
        if (ACTION === "distribute-spacing-h") {
          spacing.sort(function(a, b) { return a.b.left - b.b.left; });
          var leftEdge = spacing[0].b.left;
          var rightEdge = spacing[spacing.length - 1].b.right;
          var totalWidth = 0;
          for (var swi = 0; swi < spacing.length; swi++) totalWidth += spacing[swi].b.right - spacing[swi].b.left;
          var gap = (rightEdge - leftEdge - totalWidth) / (spacing.length - 1);
          var cursor = leftEdge;
          for (var swj = 0; swj < spacing.length; swj++) {
            var sb = spacing[swj].b;
            applyDelta(selected[spacing[swj].idx], cursor - sb.left, 0);
            cursor += (sb.right - sb.left) + gap;
          }
        } else {
          spacing.sort(function(a, b) { return a.b.top - b.b.top; });
          var topEdge = spacing[0].b.top;
          var bottomEdge = spacing[spacing.length - 1].b.bottom;
          var totalHeight = 0;
          for (var shi = 0; shi < spacing.length; shi++) totalHeight += spacing[shi].b.bottom - spacing[shi].b.top;
          var gapY = (bottomEdge - topEdge - totalHeight) / (spacing.length - 1);
          var cursorY = topEdge;
          for (var shj = 0; shj < spacing.length; shj++) {
            var sbY = spacing[shj].b;
            applyDelta(selected[spacing[shj].idx], 0, cursorY - sbY.top);
            cursorY += (sbY.bottom - sbY.top) + gapY;
          }
        }
        return "ok";
      }

      if (
        ACTION === "distribute-left" ||
        ACTION === "distribute-center-h" ||
        ACTION === "distribute-right" ||
        ACTION === "distribute-top" ||
        ACTION === "distribute-center-v" ||
        ACTION === "distribute-bottom"
      ) {
        var linear = makeIndexed(bounds);
        if (linear.length <= 2) return "ok";
        if (ACTION === "distribute-left" || ACTION === "distribute-center-h" || ACTION === "distribute-right") {
          var propH = ACTION === "distribute-left" ? "left" : (ACTION === "distribute-right" ? "right" : "centerX");
          linear.sort(function(a, b) { return a.b[propH] - b.b[propH]; });
          var firstH = linear[0].b[propH];
          var lastH = linear[linear.length - 1].b[propH];
          var stepH = (lastH - firstH) / (linear.length - 1);
          for (var lhi = 0; lhi < linear.length; lhi++) {
            applyDelta(selected[linear[lhi].idx], firstH + stepH * lhi - linear[lhi].b[propH], 0);
          }
        } else {
          var propV = ACTION === "distribute-top" ? "top" : (ACTION === "distribute-bottom" ? "bottom" : "centerY");
          linear.sort(function(a, b) { return a.b[propV] - b.b[propV]; });
          var firstV = linear[0].b[propV];
          var lastV = linear[linear.length - 1].b[propV];
          var stepV = (lastV - firstV) / (linear.length - 1);
          for (var lvi = 0; lvi < linear.length; lvi++) {
            applyDelta(selected[linear[lvi].idx], 0, firstV + stepV * lvi - linear[lvi].b[propV]);
          }
        }
        return "ok";
      }

      for (var ai = 0; ai < selected.length; ai++) {
        var current = bounds[ai];
        if (ACTION === "align-left") applyDelta(selected[ai], minLeft - current.left, 0);
        else if (ACTION === "align-right") applyDelta(selected[ai], maxRight - current.right, 0);
        else if (ACTION === "align-center-h") applyDelta(selected[ai], centerX - current.centerX, 0);
        else if (ACTION === "align-top") applyDelta(selected[ai], 0, minTop - current.top);
        else if (ACTION === "align-bottom") applyDelta(selected[ai], 0, maxBottom - current.bottom);
        else if (ACTION === "align-center-v") applyDelta(selected[ai], 0, centerY - current.centerY);
      }
    } finally {
      app.endUndoGroup();
    }
    return "ok";
  } catch (e) { return String(e); }
})()`;

export const buildScriptFromTemplate = (
	action: string,
	compTarget: boolean,
	keyTarget: boolean,
): string =>
	TEMPLATE.replace("__ACTION__", action)
		.replace("__COMP_TARGET__", compTarget ? "true" : "false")
		.replace("__KEY_TARGET__", keyTarget ? "true" : "false");

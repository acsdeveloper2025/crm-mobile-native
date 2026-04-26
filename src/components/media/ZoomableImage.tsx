// ZoomableImage — image viewer with pinch-to-zoom, scroll-to-zoom, and a
// vertical slider on the right edge for precise control.
//
// Uses react-native-webview (already a project dep) to render an HTML
// page with:
//   - pinch-zoom via native touch gestures
//   - scroll-to-zoom via mousewheel / trackpad pinch
//   - range slider on the right for fine control (1×–5×)
//   - drag-to-pan when zoomed past 1×
//
// Cross-platform: works on iOS and Android without native gesture-handler
// or reanimated dependencies.

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface ZoomableImageProps {
  uri: string;
  backgroundColor?: string;
  sliderTint?: string;
}

const buildHtml = (
  uri: string,
  bg: string,
  sliderTint: string,
): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0; padding: 0; height: 100%; width: 100%;
      background: ${bg};
      overflow: hidden;
      font-family: -apple-system, Roboto, sans-serif;
      color: #f4f4f5;
    }
    #stage {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      overflow: auto;
      touch-action: pinch-zoom pan-x pan-y;
    }
    #img {
      max-width: 100%;
      max-height: 100%;
      transform-origin: center center;
      /* No CSS transition: would fight the per-frame translate during a
         pan-drag and produce visible lag at the finger. */
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: auto;
      will-change: transform;
    }
    #sliderWrap {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      height: 60%;
      width: 44px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.35);
      border-radius: 22px;
      padding: 8px 0;
      z-index: 5;
    }
    #zoomLabel {
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
      text-shadow: 0 0 2px rgba(0,0,0,0.8);
    }
    /* Vertical range slider */
    input[type="range"] {
      -webkit-appearance: slider-vertical;
      appearance: slider-vertical;
      writing-mode: bt-lr; /* IE fallback */
      width: 24px;
      height: calc(100% - 36px);
      background: transparent;
    }
    input[type="range"]::-webkit-slider-runnable-track {
      width: 4px;
      background: rgba(255,255,255,0.25);
      border-radius: 2px;
    }
    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${sliderTint};
      border: 2px solid #fff;
      margin-top: -9px;
      cursor: pointer;
    }
    input[type="range"]::-moz-range-track {
      width: 4px;
      background: rgba(255,255,255,0.25);
      border-radius: 2px;
    }
    input[type="range"]::-moz-range-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${sliderTint};
      border: 2px solid #fff;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="stage">
    <img id="img" src="${uri}" alt="attachment" draggable="false" />
  </div>
  <div id="sliderWrap" aria-label="Zoom slider">
    <div id="zoomLabel">1.0×</div>
    <input id="zoom" type="range" min="1" max="5" step="0.1" value="1" orient="vertical" />
  </div>
  <script>
    (function () {
      var img = document.getElementById('img');
      var zoom = document.getElementById('zoom');
      var label = document.getElementById('zoomLabel');
      var stage = document.getElementById('stage');
      var scale = 1;
      // 2026-04-26: track an explicit (tx, ty) translate alongside scale.
      // Prior version only set transform: scale(N), which changes the
      // image's *visual* size but not its *layout* size — so the stage's
      // overflow:auto had nothing to scroll, and the user couldn't drag-pan
      // to look at a specific section after zooming. Now: at scale > 1 a
      // single-finger drag updates (tx, ty), bounded so the image cannot
      // be pulled off-screen, and the transform composes both.
      var tx = 0;
      var ty = 0;

      function maxOffset(axis) {
        // The image's intrinsic on-screen size at scale=1 is its rendered
        // (post max-width/max-height) box. At scale=N, the visual extent
        // is N× that. The amount the user can pan in either direction is
        // half of (visual extent - container extent), since transform-
        // origin is centered.
        var rect = img.getBoundingClientRect();
        var stageRect = stage.getBoundingClientRect();
        // rect already reflects the current transform; back out the scale
        // to get the unscaled box, then compute the visual size.
        var unscaled = axis === 'x' ? rect.width / scale : rect.height / scale;
        var visual = unscaled * scale;
        var container = axis === 'x' ? stageRect.width : stageRect.height;
        var slack = (visual - container) / 2;
        return slack > 0 ? slack : 0;
      }

      function clampTranslate() {
        var maxX = maxOffset('x');
        var maxY = maxOffset('y');
        if (tx > maxX) tx = maxX;
        else if (tx < -maxX) tx = -maxX;
        if (ty > maxY) ty = maxY;
        else if (ty < -maxY) ty = -maxY;
      }

      function applyTransform() {
        // Order matters: translate first then scale. translate values are
        // in pre-scale pixels, which is what the bounding-rect math
        // assumes.
        img.style.transform =
          'translate(' + tx.toFixed(2) + 'px, ' + ty.toFixed(2) + 'px) ' +
          'scale(' + scale.toFixed(2) + ')';
      }

      function apply(v) {
        var newScale = Math.max(1, Math.min(5, v));
        // When zooming back to 1×, recenter the image so the next zoom
        // doesn't start from a stale offset.
        if (newScale <= 1) {
          tx = 0;
          ty = 0;
        } else if (newScale !== scale) {
          // After a scale change the bounds change; clamp so we stay
          // inside the new viewport.
          var ratio = newScale / scale;
          tx = tx * ratio;
          ty = ty * ratio;
        }
        scale = newScale;
        clampTranslate();
        applyTransform();
        label.textContent = scale.toFixed(1) + '×';
        if (String(zoom.value) !== String(scale)) {
          zoom.value = String(scale);
        }
      }

      zoom.addEventListener('input', function (e) {
        apply(parseFloat(e.target.value || '1'));
      });

      // Scroll-to-zoom (mousewheel / trackpad pinch).
      stage.addEventListener('wheel', function (e) {
        if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        apply(scale + delta);
      }, { passive: false });

      // Pinch gesture support via touch events — lets two-finger pinch
      // drive the same scale the slider drives.
      var startDist = 0;
      var startScale = 1;
      // Pan gesture state for single-touch drag.
      var panActive = false;
      var panStartX = 0;
      var panStartY = 0;
      var panStartTx = 0;
      var panStartTy = 0;

      function distance(t) {
        var dx = t[0].clientX - t[1].clientX;
        var dy = t[0].clientY - t[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      }

      // The slider control should never start a pan — it's an absolute
      // overlay in the corner. Detect it via target ancestry.
      function isInsideSlider(target) {
        while (target) {
          if (target.id === 'sliderWrap' || target.id === 'zoom') return true;
          target = target.parentElement;
        }
        return false;
      }

      stage.addEventListener('touchstart', function (e) {
        if (isInsideSlider(e.target)) return;
        if (e.touches.length === 2) {
          startDist = distance(e.touches);
          startScale = scale;
          panActive = false;
        } else if (e.touches.length === 1 && scale > 1) {
          panActive = true;
          panStartX = e.touches[0].clientX;
          panStartY = e.touches[0].clientY;
          panStartTx = tx;
          panStartTy = ty;
        }
      }, { passive: true });
      stage.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2 && startDist > 0) {
          e.preventDefault();
          var d = distance(e.touches);
          apply(startScale * (d / startDist));
        } else if (e.touches.length === 1 && panActive) {
          e.preventDefault();
          var dx = e.touches[0].clientX - panStartX;
          var dy = e.touches[0].clientY - panStartY;
          tx = panStartTx + dx;
          ty = panStartTy + dy;
          clampTranslate();
          applyTransform();
        }
      }, { passive: false });
      stage.addEventListener('touchend', function () {
        startDist = 0;
        panActive = false;
      });

      // Double-tap toggles between 1× and 2.5×.
      var lastTap = 0;
      stage.addEventListener('touchend', function () {
        var now = Date.now();
        if (now - lastTap < 300) {
          apply(scale > 1.5 ? 1 : 2.5);
        }
        lastTap = now;
      });
    })();
  </script>
</body>
</html>`;

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  uri,
  backgroundColor = '#0f172a',
  sliderTint = '#2563eb',
}) => {
  const html = useMemo(
    () => buildHtml(uri, backgroundColor, sliderTint),
    [uri, backgroundColor, sliderTint],
  );
  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'about:blank' }}
        style={styles.webview}
        // Allow loading local file:// URIs on Android — needed because
        // remote attachments are downloaded to RNFS.DocumentDirectoryPath
        // and passed as file:// URIs.
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        javaScriptEnabled
        scalesPageToFit={false}
        // Hide the WebView scrollbar; the slider is the primary UI.
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // Don't let the WebView steal navigation events.
        setSupportMultipleWindows={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

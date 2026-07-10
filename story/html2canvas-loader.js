// Loads the heavy third-party renderer only when the user asks to export a card.
(function(global, document) {
  'use strict';

  var SOURCE = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
  var pending = null;

  function loadHtml2Canvas() {
    if (typeof global.html2canvas === 'function') {
      return Promise.resolve(global.html2canvas);
    }
    if (pending) return pending;

    pending = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = SOURCE;
      script.async = true;
      script.onload = function() {
        if (typeof global.html2canvas === 'function') {
          resolve(global.html2canvas);
          return;
        }
        pending = null;
        reject(new Error('html2canvas loaded without exposing its renderer'));
      };
      script.onerror = function() {
        pending = null;
        reject(new Error('html2canvas failed to load'));
      };
      document.head.appendChild(script);
    });

    return pending;
  }

  var api = global.FuluckStoryExport || (global.FuluckStoryExport = {});
  api.loadHtml2Canvas = loadHtml2Canvas;
})(window, document);

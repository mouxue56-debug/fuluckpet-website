(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    var start = function() { api.init(document, root); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : this, function() {
  function init(doc, win) {
    var bar = doc.getElementById('galleryFilters');
    var grid = doc.getElementById('galleryGrid');
    var status = doc.getElementById('galleryFilterStatus');
    if (!bar || !grid || !status || bar.getAttribute('data-gallery-ready') === 'true') return;
    bar.setAttribute('data-gallery-ready', 'true');
    var buttons = Array.from(bar.querySelectorAll('[data-gallery-filter]'));
    var selected = 'all';

    function update() {
      var items = Array.from(grid.querySelectorAll('.gallery-item'));
      var count = 0;
      items.forEach(function(item) {
        item.hidden = selected !== 'all' && item.getAttribute('data-breed') !== selected;
        if (!item.hidden) count += 1;
      });
      buttons.forEach(function(button) {
        var active = button.getAttribute('data-gallery-filter') === selected;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      var lang = (doc.documentElement.lang || 'ja').slice(0, 2);
      status.textContent = lang === 'en' ? count + ' of ' + items.length + ' photos shown' :
        lang === 'zh' ? '显示 ' + count + ' / ' + items.length + ' 张照片' :
        count + ' / ' + items.length + ' 枚の写真を表示';
    }

    buttons.forEach(function(button) {
      // Native button clicks include touch, pointer, Enter and Space activation.
      button.addEventListener('click', function() {
        selected = button.getAttribute('data-gallery-filter');
        update();
      });
    });
    win.addEventListener('langChanged', update);
    update();
  }
  return { init: init };
});

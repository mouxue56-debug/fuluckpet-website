export function mountMotionControl(onToggle) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./ambient-controls.css?v=20261004a', import.meta.url).href;
  document.head.append(stylesheet);
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'ambientMotionToggle'; button.className = 'ambient-motion-toggle';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="ambient-pause-icon"><path d="M9 6v12M15 6v12"/></g><g class="ambient-play-icon"><path d="m9 5 10 7-10 7Z"/></g></svg>';
  button.addEventListener('click', onToggle);
  // The existing contact bar remains the primary action; this control adds no layout height.
  document.body.append(button);
  return {
    update(paused, locked = false) {
      const lang = document.documentElement.lang;
      const text = lang.startsWith('zh') ? ['背景动效', '暂停背景', '恢复背景']
        : lang.startsWith('en') ? ['Background motion', 'Pause background', 'Resume background']
          : ['背景アニメーション', '背景を停止', '背景を動かす'];
      button.hidden = locked;
      button.setAttribute('aria-label', text[0]);
      button.setAttribute('aria-pressed', String(!paused));
      button.dataset.paused = String(paused);
      button.title = paused ? text[2] : text[1];
    },
  };
}

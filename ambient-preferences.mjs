const key = 'fuluck-background-motion';

export function createMotionPreference(getStorage = () => localStorage) {
  let paused = false;
  try { paused = getStorage().getItem(key) === 'paused'; } catch {}
  return {
    get paused() { return paused; },
    toggle() {
      paused = !paused;
      try { getStorage().setItem(key, paused ? 'paused' : 'auto'); } catch {}
      return paused;
    },
  };
}

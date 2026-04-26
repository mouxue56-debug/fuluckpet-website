# Live2D vs SVG decision

The reference Vue project (`fuluck-ai/frontend`) ships a Live2D Cubism model
`mao_pro` (~9 MB on disk: `mao_pro.moc3` + texture_00.png 4096px + 7
expressions + 7 motions + the Cubism core runtime).

For a marketing landing-page widget that must load on every public page, this
is too heavy:

- 9 MB of model assets + ~1 MB SDK runtime = ~10 MB pre-paint blocker
- Cubism core runtime has restrictive license terms when redistributed
  (Live2D Open Software License v3.1) — unsuitable for blanket inclusion in a
  public-facing static site without a deeper license review

**Decision (2026-04-26):** ship a CSS-animated inline SVG cat avatar
(`avatar/fukunyan.svg` and inline copy embedded in `widget.js`). It loads in
~0 KB of network overhead (inline), animates via prefers-reduced-motion-aware
CSS keyframes, and matches the existing site palette (cream / warm peach).

If we later want a richer animated character we can lazy-load Live2D from a
separate CDN bundle behind a button click and swap the avatar element — the
SVG renders in the same `.fuluck-chat-bubble-avatar` slot.

**Decision: SVG avatar (no Live2D shipped).**

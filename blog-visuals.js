/* Editorial illustrations only: no image is evidence of identity, health or a sale. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FuluckBlogVisuals = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var groups = {
  "siberian": {
    "src": "/images/blog-scenes/v1/siberian-adult.webp",
    "slugs": [
      "siberian-character",
      "siberian-history",
      "siberian-lifespan",
      "siberian-voice",
      "large-cat-breeds",
      "natural-cat-breeds",
      "cat-breed-ranking-japan"
    ]
  },
  "records": {
    "src": "/images/guide-scenes/v2/passport-480.webp",
    "slugs": [
      "siberian-color-types",
      "siberian-cfa-breed-standard",
      "siberian-coat-color-guide",
      "siberian-vs-bsh-vs-ragdoll",
      "cat-genetic-test",
      "hcm-pkd-test-explained",
      "pedigree-certificate",
      "fuluck-200-graduates-stories",
      "fuluck-2025-award-1st-reasons",
      "fuluck-customer-reviews-summary",
      "fuluck-founder-story",
      "allergy-test-method",
      "allergy-medications",
      "siberian-allergy-test-real",
      "cat-age-human",
      "siberian-owner-stories",
      "cat-domestication-history",
      "cat-five-senses",
      "cat-magnetic-sense",
      "cat-righting-reflex",
      "graduate-cat-stories"
    ]
  },
  "food": {
    "src": "/images/guide-scenes/v3/passport-food-480.webp",
    "slugs": [
      "kitten-food-guide",
      "food-dry-vs-wet",
      "cat-dangerous-foods",
      "food-transition",
      "cat-treats-guide",
      "cat-appetite-loss",
      "cat-food-allergy",
      "siberian-kitten-feeding-guide",
      "cat-taste-preferences",
      "senior-cat-diet"
    ]
  },
  "tools": {
    "src": "/images/page-scenes/v1/grooming-tools-480.webp",
    "slugs": [
      "long-hair-brushing",
      "cat-shampoo-guide",
      "cat-nail-clipping",
      "cat-shedding-season",
      "cat-hairball-prevention",
      "cat-grooming-tools",
      "cat-paw-pads",
      "cat-tongue-structure",
      "cat-whiskers-function",
      "siberian-grooming-basics"
    ]
  },
  "room": {
    "src": "/images/page-scenes/v1/blog-room-480.webp",
    "slugs": [
      "cats-lily-safety-home",
      "kitten-week1-guide",
      "kitten-room-safety",
      "kitten-first-time",
      "first-week-arrival-tips",
      "cat-apartment-living",
      "cat-indoor-benefits",
      "cat-naming-guide",
      "cat-proof-your-home",
      "cat-smell-jacobson",
      "cat-spatial-cognition",
      "first-cat-common-mistakes"
    ]
  },
  "play": {
    "src": "/images/page-scenes/v1/blog-play-480.webp",
    "slugs": [
      "cat-stress-signs",
      "cat-exercise-play",
      "cat-body-language",
      "cat-communication-sounds",
      "cat-diy-toys",
      "cat-body-language-tail-ears",
      "cat-emotions-expression",
      "cat-enrichment-ideas",
      "cat-hunting-instinct",
      "kitten-toy-guide",
      "cat-jumping-physics"
    ]
  },
  "questions": {
    "src": "/images/guide-scenes/v3/visit-questions-480.webp",
    "slugs": [
      "choose-breeder",
      "breeder-vs-petshop",
      "breeder-visit-guide",
      "siberian-osaka-guide",
      "kansai-breeder-guide",
      "shop-vs-breeder-siberian",
      "breeder-visit-flow-osaka",
      "cattery-daily-routine",
      "cattery-visit-preparation-guide",
      "choose-healthy-kitten-checklist",
      "fuluck-aftercare-promise",
      "kansai-vs-kanto-cattery",
      "osaka-cat-vet-network",
      "osaka-jouto-access-guide"
    ]
  },
  "weight": {
    "src": "/images/guide-scenes/v2/weight-log-480.webp",
    "slugs": [
      "siberian-weight-size",
      "kitten-weight-management",
      "cat-obesity-prevention",
      "kitten-growth-guide"
    ]
  },
  "budget": {
    "src": "/images/guide-scenes/v2/price-480.webp",
    "slugs": [
      "kitten-price-factors",
      "siberian-price-guide",
      "cat-insurance-guide",
      "cat-cost-monthly",
      "cat-first-year-cost",
      "siberian-cost-breakdown"
    ]
  },
  "neuter": {
    "src": "/images/guide-scenes/v3/neuter-individual-480.webp",
    "slugs": [
      "cat-neuter-timing",
      "spay-neuter-timing-siberian"
    ]
  },
  "water": {
    "src": "/images/faq-scenes/v1/health.webp",
    "slugs": [
      "cat-water-intake",
      "cat-hydration-tips"
    ]
  },
  "litter": {
    "src": "/images/page-scenes/v1/blog-litter-480.webp",
    "slugs": [
      "cat-stool-check",
      "cat-litter-guide",
      "cat-toilet-cleaning",
      "cat-toilet-training",
      "cat-spray-behavior"
    ]
  },
  "rest": {
    "src": "/images/page-scenes/v1/boarding-rest-480.webp",
    "slugs": [
      "cat-night-crying",
      "cat-hiding-reasons",
      "cat-sleeping-habits",
      "cat-purring-meaning",
      "cat-dreams-sleep-cycle",
      "cat-kneading-behavior",
      "cat-winter-care"
    ]
  },
  "redirect": {
    "src": "/images/guide-scenes/v3/behavior-redirect-480.webp",
    "slugs": [
      "cat-claws-anatomy",
      "cat-biting-habit",
      "cat-memory-learning",
      "cat-territorial-behavior"
    ]
  },
  "family": {
    "src": "/images/page-scenes/v1/family-companion-480.webp",
    "slugs": [
      "cat-socialization",
      "cat-slow-blink",
      "kitten-and-children",
      "kitten-socialization-period",
      "kitten-socialization-3to12-weeks",
      "cat-and-baby"
    ]
  },
  "multi": {
    "src": "/images/guide-scenes/v2/multi-cat-480.webp",
    "slugs": [
      "cat-social-hierarchy",
      "kitten-meet-existing-cat",
      "cat-and-other-pets",
      "multi-cat-tips"
    ]
  },
  "packing": {
    "src": "/images/page-scenes/v1/boarding-packing-480.webp",
    "slugs": [
      "kitten-checklist",
      "first-time-cat-checklist-osaka",
      "kansai-cat-shipping-options",
      "cat-disaster-prep",
      "cat-moving-stress",
      "cat-travel-tips",
      "cat-carrier-guide"
    ]
  },
  "arrival": {
    "src": "/images/guide-scenes/v3/day1-arrival-480.webp",
    "slugs": [
      "kitten-day1-guide",
      "bringing-kitten-home"
    ]
  },
  "photo": {
    "src": "/images/page-scenes/v1/blog-photo-v2-480.webp",
    "slugs": [
      "cat-photo-tips"
    ]
  },
  "british-shorthair": {
    "src": "/images/blog-scenes/v1/british-shorthair.webp",
    "slugs": [
      "british-shorthair-character",
      "british-shorthair-guide"
    ]
  },
  "british-longhair": {
    "src": "/images/blog-scenes/v1/british-longhair.webp",
    "slugs": [
      "british-longhair-character"
    ]
  },
  "ragdoll": {
    "src": "/images/blog-scenes/v1/ragdoll.webp",
    "slugs": [
      "ragdoll-character"
    ]
  },
  "senior-companion": {
    "src": "/images/blog-scenes/v1/senior-companion.webp",
    "slugs": [
      "senior-cat-comfort",
      "senior-cat-cognitive",
      "senior-cat-end-of-life"
    ]
  },
  "fresh-home": {
    "src": "/images/blog-scenes/v1/fresh-home.webp",
    "slugs": [
      "cat-smell-prevention",
      "cat-allergy-guide",
      "siberian-allergy-facts",
      "allergy-living-tips",
      "air-purifier-for-cats",
      "siberian-allergy-solution",
      "osaka-pet-allergy-clinics",
      "cat-summer-care"
    ]
  },
  "daily-observation": {
    "src": "/images/blog-scenes/v1/daily-observation.webp",
    "slugs": [
      "kitten-vaccine-schedule",
      "cat-virus-test",
      "cat-health-checkpoints",
      "cat-parasite-prevention",
      "cat-microchip",
      "cat-vomit-causes",
      "cat-cold-symptoms",
      "cat-balance-vestibular",
      "cat-hearing-range",
      "cat-pupils-vision",
      "cat-urinary-tract-disease",
      "cat-vaccination-guide",
      "common-cat-diseases",
      "kitten-health-prevention",
      "cat-daily-care-checklist",
      "senior-cat-diseases",
      "senior-cat-health",
      "cat-dental-care",
      "cat-dental-care-prevention",
      "cat-eye-care",
      "cat-ear-cleaning"
    ]
  },
  "neva": {
    "src": "/images/blog-scenes/v1/neva-masquerade.webp",
    "slugs": [
      "siberian-neva-masquerade"
    ]
  },
  "siberian-norwegian": {
    "src": "/images/blog-scenes/v1/siberian-norwegian.webp",
    "slugs": [
      "siberian-vs-norwegian"
    ]
  },
  "siberian-mainecoon": {
    "src": "/images/blog-scenes/v1/siberian-mainecoon.webp",
    "slugs": [
      "siberian-vs-mainecoon"
    ]
  }
};
  var bySlug = Object.create(null);
  Object.keys(groups).forEach(function (key) {
    var group = groups[key];
    group.slugs.forEach(function (slug) { bySlug[slug] = group.src; });
  });
  var captions = {ja: 'AIイメージ', en: 'AI illustration', zh: 'AI 示意图'};
  function getVisual(href) {
    if (typeof href !== 'string') return null;
    var match = /^(?:\/(?:en|zh))?\/blog\/([a-z0-9-]+)\.html(?:[?#][^\r\n]*)?$/.exec(href);
    var src = match && bySlug[match[1]];
    return src ? {src: src, width: 480, height: 320} : null;
  }
  function imageMarkup(href, lang) {
    var visual = getVisual(href);
    if (!visual) return '';
    var caption = lang === 'en' ? captions.en : lang === 'zh' ? captions.zh : captions.ja;
    return '<span class="blog-card-visual"><img src="' + visual.src + '" width="480" height="320" loading="lazy" decoding="async" alt="">' +
      '<span class="blog-card-visual-label" data-experience-ja="' + captions.ja + '" data-experience-en="' + captions.en + '" data-experience-zh="' + captions.zh + '">' + caption + '</span></span>';
  }
  return {getVisual: getVisual, imageMarkup: imageMarkup};
});

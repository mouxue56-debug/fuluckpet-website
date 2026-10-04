// Only approved page families opt in. No article, admin, or estimate is inferred.
const pages = {
  '/': { page: 'home', clips: ['A', 'B', 'C'] },
  '/about.html': { page: 'about', clips: ['C', 'A', 'B'] },
  '/kittens.html': { page: 'kittens', clips: ['A', 'B', 'C'], sections: '.kitten-card' },
  '/gallery.html': { page: 'gallery', clips: ['family', 'boarding', 'welcome'], sections: '.gallery-item' },
  '/boarding/': { page: 'boarding', clips: ['boarding', 'welcome', 'family'], sections: '.service-section' },
  '/grooming/': { page: 'grooming', clips: ['grooming', 'boarding', 'family'], sections: '.service-section' },
  '/booking.html': { page: 'booking', clips: ['welcome', 'family', 'boarding'] },
  '/waitlist.html': { page: 'waitlist', clips: ['welcome', 'family', 'boarding'] },
  '/guide/': { page: 'guide', clips: ['welcome', 'grooming', 'family'], sections: '.guide-category' },
  '/blog.html': { page: 'blog', clips: ['family', 'boarding', 'welcome'], sections: '.blog-card' },
};

export function ambientPage(pathname) {
  const route = pathname.replace(/^\/(?:en|zh)(?=\/)/, '').replace(/\/index\.html$/, '/');
  return pages[route] ?? null;
}

export function contentAnchors(tops, viewport) {
  if (tops.length < 3) return [];
  return [tops[Math.floor(tops.length / 3)], tops[Math.floor(tops.length * 2 / 3)]]
    .map(y => y - viewport * .4);
}

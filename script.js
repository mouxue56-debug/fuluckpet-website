/* ========================================
   福楽キャッテリー - Main Script
   Premium animations + Dynamic photo system
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ===== Scroll Progress Bar =====
  const scrollProgress = document.querySelector('.scroll-progress');
  if (scrollProgress) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      scrollProgress.style.width = pct + '%';
    }, { passive: true });
  }

  // ===== Header scroll effect =====
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });

  // ===== Mobile menu =====
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const navFab = document.getElementById('mobileNavFab');

  function setMobileNavOpen(open) {
    if (!mobileNav) return;
    mobileNav.classList.toggle('active', open);
    if (hamburger) {
      hamburger.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (navFab) {
      navFab.classList.toggle('active', open);
      navFab.setAttribute('aria-expanded', open ? 'true' : 'false');
      navFab.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    }
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (!window.__fuluckNavOwnsMobile && hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      setMobileNavOpen(!mobileNav.classList.contains('active'));
    });
  }

  if (!window.__fuluckNavOwnsMobile && navFab && mobileNav) {
    navFab.addEventListener('click', () => {
      setMobileNavOpen(!mobileNav.classList.contains('active'));
    });
    // Press Esc to close (matches modal expectations)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
        setMobileNavOpen(false);
      }
    });
  }

  if (!window.__fuluckNavOwnsMobile && mobileNav) {
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => setMobileNavOpen(false));
    });
  }

  // ===== Nav Dropdown (Desktop) =====
  const navDropdown = document.querySelector('.nav-dropdown');
  if (navDropdown) {
    const toggle = navDropdown.querySelector('.nav-dropdown-toggle');
    // Click toggle for touch devices
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navDropdown.classList.toggle('active');
    });
    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!navDropdown.contains(e.target)) {
        navDropdown.classList.remove('active');
      }
    });
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') navDropdown.classList.remove('active');
    });
  }

  // ===== Hero Title Char-by-Char Animation =====
  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle) {
    const lines = heroTitle.querySelectorAll('span[data-i18n], .hero-accent');
    let charIndex = 0;
    lines.forEach(line => {
      const text = line.textContent;
      const isAccent = line.classList.contains('hero-accent');
      line.replaceChildren();
      [...text].forEach(ch => {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch;
        span.style.animationDelay = (charIndex * 0.04) + 's';
        if (isAccent) {
          span.style.background = 'linear-gradient(135deg, #7DD3C0, #5BC4A8)';
          span.style.webkitBackgroundClip = 'text';
          span.style.webkitTextFillColor = 'transparent';
          span.style.backgroundClip = 'text';
        }
        line.appendChild(span);
        charIndex++;
      });
    });
  }

  // ===== Update visible kitten count =====
  function updateKittenCount() {
    const visible = document.querySelectorAll('.kitten-card:not(.hidden)');
    const countEl = document.getElementById('visibleCount');
    if (countEl) countEl.textContent = visible.length;
  }

  // ===== Kitten filter tabs =====
  const filterBtns = document.querySelectorAll('.filter-btn');

  function applyKittenFilter(filter, animate) {
    // Use a live DOM query so cards rebuilt by card-loader are included.
    const liveCards = document.querySelectorAll('.kitten-card');

    liveCards.forEach((card, i) => {
      if (filter === 'all' || card.dataset.status === filter) {
        card.classList.remove('hidden');
        if (animate) {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, i * 80);
        }
      } else {
        card.classList.add('hidden');
      }
    });
    if (animate) setTimeout(updateKittenCount, 100);
    else updateKittenCount();
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyKittenFilter(btn.dataset.filter, true);
    });
  });

  // ===== Kitten Sorting =====
  const sortBtns = document.querySelectorAll('.sort-btn');
  const kittensGridEl = document.getElementById('kittensGrid');

  if (kittensGridEl) {
    const catalog = window.FuluckKittenCatalog;

    function orderCards(selectedSort) {
      const cards = Array.from(kittensGridEl.querySelectorAll('.kitten-card'));
      if (!catalog) return cards;
      const records = cards.map((card) => {
        const promotionPriority = Number(card.dataset.promotionPriority);
        return {
          breederId: card.dataset.breederId,
          status: card.dataset.status,
          promotionTag: card.dataset.promotionTag,
          promotionPriority: Number.isInteger(promotionPriority) ? promotionPriority : 0,
          price: catalog.normalizeSalePrice(card.dataset.price),
          birthday: card.dataset.birthday,
          card: card,
        };
      });
      return catalog.orderKittens(records, { secondary: selectedSort || 'default' })
        .map((record) => record.card);
    }

    function renderSortedCards(selectedSort, animate) {
      const cards = orderCards(selectedSort);
      cards.forEach((card, i) => {
        if (animate) {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
        }
        kittensGridEl.appendChild(card);
        if (animate) {
          setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, i * 60);
        }
      });
    }

    function activeControlValue(buttons, dataKey, fallback) {
      const active = Array.from(buttons).find(button => button.classList.contains('active'));
      return active?.dataset[dataKey] || fallback;
    }

    function refreshKittenCatalogControls() {
      renderSortedCards(activeControlValue(sortBtns, 'sort', 'default'), false);
      applyKittenFilter(activeControlValue(filterBtns, 'filter', 'all'), false);
    }

    // Keep the static fallback in the same default order as generated/runtime data.
    renderSortedCards('default', false);

    sortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sortBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sortType = btn.dataset.sort;
        renderSortedCards(sortType, true);
      });
    });

    // card-loader replaces the grid after API and language refreshes. Reapply the
    // still-active controls once, without dispatching another event or re-animating.
    window.refreshKittenCatalogControls = refreshKittenCatalogControls;
    window.addEventListener('cardsLoaded', refreshKittenCatalogControls);
  }

  // ===== Modal a11y helpers (dialog semantics + focus trap) =====
  // Shared open/close for #kittenModal / #parentModal so keyboard users get
  // proper dialog semantics, a focus trap, and focus restoration on close.
  let modalLastFocused = null;
  let modalTrapHandler = null;

  function getModalFocusables(modal) {
    return Array.from(modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  function openModalA11y(modal) {
    if (!modal) return;
    modalLastFocused = document.activeElement;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    // Accessible name: prefer the modal's visible title element
    const titleEl = modal.querySelector('.modal-name');
    if (titleEl) {
      if (!titleEl.id) titleEl.id = modal.id + '-title';
      modal.setAttribute('aria-labelledby', titleEl.id);
      modal.removeAttribute('aria-label');
    } else {
      modal.setAttribute('aria-label', '詳細');
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Move focus into the modal (close button is a reliable first target).
    // Deferred because .active reveals the modal via a CSS visibility transition —
    // focusing while still visibility:hidden is a no-op. rAF handles the common
    // case; a short timeout fallback re-focuses if the transition hadn't applied yet.
    const focusFirst = () => {
      if (!modal.classList.contains('active')) return; // closed again before focus ran
      if (modal.contains(document.activeElement) && document.activeElement !== modal) return; // already inside
      const focusables = getModalFocusables(modal);
      const firstTarget = modal.querySelector('.modal-close') || focusables[0] || modal;
      if (firstTarget === modal && !modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
      firstTarget.focus();
    };
    requestAnimationFrame(() => requestAnimationFrame(focusFirst));
    setTimeout(focusFirst, 80);

    // Trap Tab / Shift+Tab within the modal
    modalTrapHandler = function (e) {
      if (e.key !== 'Tab') return;
      const items = getModalFocusables(modal);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !modal.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !modal.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    modal.addEventListener('keydown', modalTrapHandler);
  }

  function closeModalA11y(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (modalTrapHandler) {
      modal.removeEventListener('keydown', modalTrapHandler);
      modalTrapHandler = null;
    }
    // Restore focus to the element that opened the modal
    if (modalLastFocused && typeof modalLastFocused.focus === 'function') {
      modalLastFocused.focus();
    }
    modalLastFocused = null;
  }
  window.__closeModalA11y = closeModalA11y;

  // ===== Dynamic Kitten Detail Modal =====
  const kittenModal = document.getElementById('kittenModal');
  const modalClose = document.getElementById('modalClose');

  function createModalNode(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function appendModalIcon(parent, iconClass) {
    const icon = createModalNode('i', 'ico ' + iconClass);
    icon.setAttribute('aria-hidden', 'true');
    parent.appendChild(icon);
    return icon;
  }

  function safeModalMediaUrl(value) {
    if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u0020"'<>`\\]/.test(value)) return '';
    try {
      if (value.charAt(0) === '/' && value.slice(0, 2) !== '//') {
        const local = new URL(value, 'https://fuluckpet.com');
        return local.pathname + local.search;
      }
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function safeModalMediaList(value) {
    if (typeof value !== 'string') return [];
    return value.split(',').map((item) => safeModalMediaUrl(item.trim())).filter(Boolean);
  }

  function safeYouTubeEmbedUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return '';
    value = value.trim();
    const iframeSrc = value.match(/src=["']([^"']+)["']/i);
    if (iframeSrc) value = iframeSrc[1];
    if (!value || /[\u0000-\u0020"'<>`\\]/.test(value)) return '';
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      let id = '';
      if (host === 'youtu.be') {
        id = parsed.pathname.slice(1).split('/')[0];
      } else if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'www.youtube-nocookie.com') {
        if (parsed.pathname.indexOf('/embed/') === 0) id = parsed.pathname.split('/')[2] || '';
        else if (parsed.pathname === '/watch') id = parsed.searchParams.get('v') || '';
      }
      return /^[A-Za-z0-9_-]{6,64}$/.test(id) ? 'https://www.youtube.com/embed/' + id : '';
    } catch (error) {
      return '';
    }
  }

  function appendMediaPlaceholder(parent, className, message) {
    const placeholder = createModalNode('div', 'img-placeholder ' + className);
    const iconWrap = createModalNode('span');
    appendModalIcon(iconWrap, 'ico-cat');
    placeholder.appendChild(iconWrap);
    placeholder.appendChild(createModalNode('p', '', message));
    parent.appendChild(placeholder);
  }

  function buildMediaCarousel(gallery, images, videoEmbedUrl, altPrefix, options = {}) {
    const carousel = createModalNode('div', 'carousel');
    const main = createModalNode('div', 'carousel-main');
    const dots = createModalNode('div', 'carousel-dots');
    const thumbs = createModalNode('div', 'carousel-thumbs');
    let itemCount = 0;

    images.forEach((url, index) => {
      const active = itemCount === 0;
      const slide = createModalNode('div', 'carousel-slide' + (active ? ' active' : ''));
      const image = createModalNode('img');
      image.setAttribute('src', url);
      image.setAttribute('alt', altPrefix + ' ' + (index + 1));
      image.setAttribute('loading', 'lazy');
      slide.appendChild(image);
      main.appendChild(slide);
      dots.appendChild(createModalNode('span', 'dot' + (active ? ' active' : '')));

      const thumb = createModalNode('div', 'thumb' + (active ? ' active' : ''));
      const thumbImage = createModalNode('img');
      thumbImage.setAttribute('src', url);
      thumbImage.setAttribute('alt', 'サムネイル ' + (index + 1));
      thumb.appendChild(thumbImage);
      thumbs.appendChild(thumb);
      itemCount += 1;
    });

    if (videoEmbedUrl) {
      const active = itemCount === 0;
      const slide = createModalNode('div', 'carousel-slide' + (active ? ' active' : ''));
      const wrapper = createModalNode('div', 'video-wrapper');
      const frame = createModalNode('iframe');
      frame.setAttribute('src', videoEmbedUrl);
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      frame.setAttribute('loading', 'lazy');
      wrapper.appendChild(frame);
      slide.appendChild(wrapper);
      main.appendChild(slide);
      dots.appendChild(createModalNode('span', 'dot video-dot' + (active ? ' active' : ''), '▶'));

      const thumb = createModalNode('div', 'thumb video-thumb' + (active ? ' active' : ''));
      const placeholder = createModalNode('div', 'img-placeholder thumb-ph', '▶');
      thumb.appendChild(placeholder);
      thumbs.appendChild(thumb);
      itemCount += 1;
    }

    if (itemCount === 0) {
      const slide = createModalNode('div', 'carousel-slide active');
      appendMediaPlaceholder(slide, options.placeholderClass || 'kit-modal-ph', options.emptyMessage || '写真準備中');
      main.appendChild(slide);
      dots.appendChild(createModalNode('span', 'dot active'));
      itemCount = 1;
    }

    carousel.appendChild(main);
    const previous = createModalNode('button', 'carousel-btn carousel-prev', '‹');
    previous.setAttribute('type', 'button');
    const next = createModalNode('button', 'carousel-btn carousel-next', '›');
    next.setAttribute('type', 'button');
    carousel.appendChild(previous);
    carousel.appendChild(next);
    carousel.appendChild(dots);

    const content = [carousel];
    if (thumbs.children.length > 0 && (options.alwaysShowThumbs || thumbs.children.length > 1)) content.push(thumbs);
    gallery.replaceChildren(...content);
    initCarousel(gallery);
  }

  async function buildCarousel(card) {
    if (!kittenModal) return;
    let images = safeModalMediaList(card.dataset.images || '');
    const videoEmbedUrl = safeYouTubeEmbedUrl(card.dataset.video || '');
    const gallery = kittenModal.querySelector('.modal-gallery');
    if (!gallery) return;

    // If no hardcoded images but has Drive folder, load from Drive
    if (images.length === 0 && /^[A-Za-z0-9_-]+$/.test(card.dataset.driveFolder || '') && window.DriveLoader) {
      const loadingSlide = createModalNode('div', 'carousel-slide active');
      const loading = createModalNode('div', 'img-placeholder kit-modal-ph');
      loading.appendChild(createModalNode('span', '', '⏳'));
      loading.appendChild(createModalNode('p', '', '読み込み中...'));
      loadingSlide.appendChild(loading);
      gallery.replaceChildren(loadingSlide);
      const driveUrls = await window.DriveLoader.loadCardImages(card);
      if (driveUrls) {
        images = safeModalMediaList(driveUrls);
      }
    }

    buildMediaCarousel(gallery, images, videoEmbedUrl, '子猫の写真', {
      alwaysShowThumbs: true,
      placeholderClass: 'kit-modal-ph',
      emptyMessage: '写真を読み込み中...'
    });
  }

  function initCarousel(container) {
    const slides = container.querySelectorAll('.carousel-slide');
    const dots = container.querySelectorAll('.dot');
    const thumbs = container.querySelectorAll('.thumb');
    let current = 0;

    function goTo(idx) {
      if (idx < 0) idx = slides.length - 1;
      if (idx >= slides.length) idx = 0;
      slides.forEach(s => s.classList.remove('active'));
      dots.forEach(d => d.classList.remove('active'));
      thumbs.forEach(t => t.classList.remove('active'));
      if (slides[idx]) slides[idx].classList.add('active');
      if (dots[idx]) dots[idx].classList.add('active');
      if (thumbs[idx]) thumbs[idx].classList.add('active');
      current = idx;
    }

    const prev = container.querySelector('.carousel-prev');
    const next = container.querySelector('.carousel-next');
    if (prev) prev.addEventListener('click', e => { e.stopPropagation(); goTo(current - 1); });
    if (next) next.addEventListener('click', e => { e.stopPropagation(); goTo(current + 1); });
    dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
    thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => goTo(i)));

    // Touch swipe
    let startX = 0;
    const main = container.querySelector('.carousel-main');
    if (main) {
      main.addEventListener('touchstart', e => { startX = e.changedTouches[0].screenX; }, { passive: true });
      main.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
      }, { passive: true });
    }
  }

  function appendModalDetail(container, label, value, options = {}) {
    const row = createModalNode('div', 'detail-row');
    row.appendChild(createModalNode('span', 'detail-label', label));
    const valueNode = createModalNode('span', 'detail-value');
    if (options.icon) appendModalIcon(valueNode, options.icon);
    if (options.icon && value) valueNode.appendChild(document.createTextNode(' '));
    valueNode.appendChild(document.createTextNode(value || ''));
    if (options.accent) {
      valueNode.style.color = 'var(--mint)';
      valueNode.style.fontWeight = '600';
    }
    row.appendChild(valueNode);
    container.appendChild(row);
    return row;
  }

  function findCardByDataset(selector, field, value) {
    return Array.from(document.querySelectorAll(selector)).find((candidate) => candidate.dataset[field] === value) || null;
  }

  function createParentChip(name, relation, iconClass) {
    const chip = createModalNode('div', 'modal-parent-chip clickable');
    chip.dataset.parentName = name;
    const iconWrap = createModalNode('span', 'parent-chip-icon');
    appendModalIcon(iconWrap, iconClass);
    chip.appendChild(iconWrap);
    chip.appendChild(createModalNode('span', '', relation + ': ' + name));
    chip.addEventListener('click', (event) => {
      event.stopPropagation();
      const parentName = chip.dataset.parentName;
      if (!parentName) return;
      const parentCard = findCardByDataset('.parent-card', 'name', parentName);
      if (parentCard && typeof window.openParentModal === 'function') {
        closeModalA11y(kittenModal);
        window.openParentModal(parentCard);
      } else {
        closeModalA11y(kittenModal);
        window.location.href = 'parents.html#parent-' + encodeURIComponent(parentName);
      }
    });
    return chip;
  }

  const KITTEN_MODAL_COPY = {
    ja: {
      status: { available: '販売中', reserved: 'ご予約済', sold: 'ご家族決定' },
      soldText: 'ご家族が決まりました', tax: '（税込）', breed: '猫種', sex: '性別', color: 'カラー',
      birthday: '誕生日', listingId: '掲載ID', parents: '両親', dad: 'パパ', mom: 'ママ',
      previous: '前', next: '次', previousTitle: '前の子猫', nextTitle: '次の子猫',
      parentFather: 'パパ猫', parentMother: 'ママ猫', parentFallback: '親猫', photosLoading: '読み込み中...', photosPreparing: '写真準備中',
      age: '年齢', testInfo: '検査情報', testRecorded: '検査情報あり', testMissing: '検査情報の掲載なし', noChildren: '現在表示中の子猫はいません', childrenLoading: '子猫情報を読み込んでいます…', childrenError: '子猫情報を読み込めませんでした',
      male: '♂ 男の子', female: '♀ 女の子',
      lawTitle: '動物愛護管理法に基づく対面販売',
      lawText: '法律の規定により、ご購入前に必ずキャッテリーにお越しいただき、子猫と対面していただく必要がございます。',
      line: 'この子についてLINEで相談', note: '※ 購入前のちょっとした質問だけでもOKです', booking: '見学を予約',
    },
    en: {
      status: { available: 'Available', reserved: 'Reserved', sold: 'Adopted' },
      soldText: 'This kitten has joined a family', tax: '(tax incl.)', breed: 'Breed', sex: 'Sex', color: 'Color',
      birthday: 'Birthday', listingId: 'Listing ID', parents: 'Parents', dad: 'Dad', mom: 'Mom',
      previous: 'Previous', next: 'Next', previousTitle: 'Previous kitten', nextTitle: 'Next kitten',
      parentFather: 'Father', parentMother: 'Mother', parentFallback: 'Parent cat', photosLoading: 'Loading photos...', photosPreparing: 'Photos are being prepared',
      age: 'Age', testInfo: 'Test information', testRecorded: 'Test information recorded', testMissing: 'No test information listed', noChildren: 'No kittens are currently displayed', childrenLoading: 'Loading kitten information…', childrenError: 'Unable to load kitten information',
      male: 'Male', female: 'Female',
      lawTitle: 'In-Person Sales under the Animal Protection Law',
      lawText: 'Japanese law requires an in-person meeting to see the kitten and receive an explanation before purchase. Please arrange a visit to the cattery.',
      line: 'Ask about this kitten on LINE', note: 'Questions are welcome, even before you decide to purchase.', booking: 'Book a Visit',
    },
    zh: {
      status: { available: '可预约', reserved: '已预订', sold: '已出售' },
      soldText: '这只猫咪已找到新家', tax: '（含税）', breed: '品种', sex: '性别', color: '毛色',
      birthday: '生日', listingId: '刊登ID', parents: '父母猫', dad: '爸爸', mom: '妈妈',
      previous: '上一只', next: '下一只', previousTitle: '上一只幼猫', nextTitle: '下一只幼猫',
      parentFather: '父猫', parentMother: '母猫', parentFallback: '父母猫', photosLoading: '照片加载中...', photosPreparing: '照片准备中',
      age: '年龄', testInfo: '检测信息', testRecorded: '已登记检测信息', testMissing: '未刊登检测信息', noChildren: '目前没有显示中的幼猫', childrenLoading: '正在加载幼猫信息…', childrenError: '幼猫信息加载失败',
      male: '男孩', female: '女孩',
      lawTitle: '依据《动物爱护管理法》的面对面销售',
      lawText: '根据日本法律，购买前必须到访猫舍，与幼猫见面并听取相关说明。请提前预约参观。',
      line: '通过LINE咨询这只猫咪', note: '尚未决定购买也没关系，欢迎先咨询。', booking: '预约见学',
    },
  };

  function getKittenModalCopy() {
    const lang = String(document.documentElement?.lang || 'ja').toLowerCase();
    if (lang.startsWith('en')) return KITTEN_MODAL_COPY.en;
    if (lang.startsWith('zh')) return KITTEN_MODAL_COPY.zh;
    return KITTEN_MODAL_COPY.ja;
  }

  function populateModalInfo(card) {
    if (!kittenModal) return;
    const info = kittenModal.querySelector('.modal-info');
    if (!info) return;

    const breed = card.querySelector('h3')?.textContent || '';
    const kittenName = card.dataset.name || '';
    const displayName = kittenName || breed;
    const meta = card.querySelectorAll('.kit-meta');
    const gender = meta[0]?.textContent || '';
    const birthday = meta[1]?.textContent || '';
    const price = card.querySelector('.kit-price')?.textContent || '';
    const status = ['available', 'reserved', 'sold'].includes(card.dataset.status) ? card.dataset.status : 'sold';
    const isNew = card.dataset.new === 'true';
    const papa = card.dataset.papa || '';
    const mama = card.dataset.mama || '';
    const breederId = card.dataset.breederId || '';
    const isSold = status === 'sold';

    const copy = getKittenModalCopy();

    const statusClasses = { available: 'st-available', reserved: 'st-reserved', sold: 'st-sold' };

    const content = [];
    const statusRow = createModalNode('div', 'modal-status-row');
    statusRow.appendChild(createModalNode('span', 'kit-status ' + statusClasses[status], copy.status[status]));
    if (isNew) statusRow.appendChild(createModalNode('span', 'kit-badge-new', 'NEW'));
    content.push(statusRow, createModalNode('h2', 'modal-name', displayName));

    if (!isSold) {
      const priceRow = createModalNode('div', 'modal-price-row');
      priceRow.appendChild(createModalNode('span', 'modal-price', price.replace(/(?:（税込）|\(tax incl\.\)|（含税）)/gi, '').trim()));
      const rawDataPrice = String(card.dataset.price || '').trim();
      const hasNumericPrice = /^[1-9][0-9]*$/.test(rawDataPrice) || /[¥￥]\s*[0-9]/.test(price);
      if (hasNumericPrice) priceRow.appendChild(createModalNode('span', 'tax', copy.tax));
      content.push(priceRow);
    } else {
      const sold = createModalNode('p', 'sold-text', copy.soldText);
      sold.style.marginBottom = '20px';
      content.push(sold);
    }

    const details = createModalNode('div', 'modal-details');
    const genderParts = gender.split('・');
    appendModalDetail(details, copy.breed, breed);
    appendModalDetail(details, copy.sex, (genderParts[0] || '').trim());
    appendModalDetail(details, copy.color, (genderParts[1] || '').trim());
    appendModalDetail(details, copy.birthday, birthday);
    if (breederId) appendModalDetail(details, copy.listingId, breederId, { accent: true });
    content.push(details);

    if (papa || mama) {
      const parents = createModalNode('div', 'modal-parents');
      parents.appendChild(createModalNode('h4', '', copy.parents));
      const row = createModalNode('div', 'modal-parent-row');
      if (papa) row.appendChild(createParentChip(papa, copy.dad, 'ico-mars'));
      if (mama) row.appendChild(createParentChip(mama, copy.mom, 'ico-venus'));
      parents.appendChild(row);
      content.push(parents);
    }

    const law = createModalNode('div', 'law-notice-compact');
    const lawTitle = createModalNode('div', 'law-notice-title');
    appendModalIcon(lawTitle, 'ico-clipboard-list');
    lawTitle.appendChild(document.createTextNode(' ' + copy.lawTitle));
    law.appendChild(lawTitle);
    law.appendChild(createModalNode('p', '', copy.lawText));
    content.push(law);

    const line = createModalNode('a', 'btn btn-line modal-line-btn');
    line.setAttribute('href', 'https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true');
    line.setAttribute('target', '_blank');
    line.setAttribute('rel', 'noopener');
    line.style.background = '#07843F';
    line.style.borderRadius = '12px';
    line.style.color = '#fff';
    line.style.fontSize = '16px';
    line.style.fontWeight = '700';
    line.style.letterSpacing = '0.02em';
    appendModalIcon(line, 'ico-paw-print');
    line.appendChild(document.createTextNode(' ' + copy.line));
    content.push(line);

    const note = createModalNode('p', '', copy.note);
    note.style.textAlign = 'center';
    note.style.fontSize = '12px';
    note.style.color = 'var(--text-note)';
    note.style.marginTop = '6px';
    content.push(note);

    const actions = createModalNode('div', 'modal-actions');
    actions.style.marginTop = '12px';
    const booking = createModalNode('a', 'btn btn-secondary modal-visit-btn', copy.booking);
    booking.setAttribute('href', '/booking.html');
    booking.addEventListener('click', () => closeModalA11y(kittenModal));
    actions.appendChild(booking);
    content.push(actions);

    info.replaceChildren(...content);
  }

  // ===== Kitten Modal Navigation (prev/next kitten) =====
  let allKittenCards = Array.from(document.querySelectorAll('.kitten-card'));
  let currentKittenIndex = -1;
  const isKittensPage = Boolean(document.querySelector('.page-hero')) && window.location.pathname.indexOf('kittens') >= 0;

  function bindCardActivation(card, role, activate) {
    card.setAttribute('role', role);
    card.setAttribute('tabindex', '0');
    if (role === 'button') card.setAttribute('aria-haspopup', 'dialog');
    else card.removeAttribute('aria-haspopup');

    if (card.dataset.cardActivationBound === '1') return;
    card.dataset.cardActivationBound = '1';
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
  }

  function activateKittenCard(card) {
    const detailUrl = card.dataset.detailUrl || card.getAttribute('data-detail-url') || '';
    if (isKittensPage && detailUrl) {
      window.location.href = detailUrl;
      return;
    }
    if (!kittenModal) return;
    currentKittenIndex = allKittenCards.indexOf(card);
    buildCarousel(card);
    populateModalInfo(card);
    openModalA11y(kittenModal);
    updateKittenNavButtons();
  }

  function openKittenByIndex(idx) {
    if (idx < 0 || idx >= allKittenCards.length) return;
    // Skip hidden cards (filtered out)
    let target = idx;
    const dir = idx > currentKittenIndex ? 1 : -1;
    while (target >= 0 && target < allKittenCards.length && allKittenCards[target].classList.contains('hidden')) {
      target += dir;
    }
    if (target < 0 || target >= allKittenCards.length) return;

    currentKittenIndex = target;
    const card = allKittenCards[target];
    buildCarousel(card);
    populateModalInfo(card);
    updateKittenNavButtons();
  }

  function updateKittenNavButtons() {
    const prevBtn = kittenModal?.querySelector('.modal-kitten-prev');
    const nextBtn = kittenModal?.querySelector('.modal-kitten-next');
    if (!prevBtn || !nextBtn) return;
    const copy = getKittenModalCopy();
    prevBtn.textContent = '‹ ' + copy.previous;
    prevBtn.title = copy.previousTitle;
    nextBtn.textContent = copy.next + ' ›';
    nextBtn.title = copy.nextTitle;

    // Find prev/next visible card
    let hasPrev = false, hasNext = false;
    for (let i = currentKittenIndex - 1; i >= 0; i--) {
      if (!allKittenCards[i].classList.contains('hidden')) { hasPrev = true; break; }
    }
    for (let i = currentKittenIndex + 1; i < allKittenCards.length; i++) {
      if (!allKittenCards[i].classList.contains('hidden')) { hasNext = true; break; }
    }
    prevBtn.style.display = hasPrev ? '' : 'none';
    nextBtn.style.display = hasNext ? '' : 'none';
  }

  // Add nav buttons to modal-overlay (not container, to avoid overflow clipping)
  if (kittenModal) {
    const navCopy = getKittenModalCopy();
    const prevBtn = document.createElement('button');
    prevBtn.className = 'modal-kitten-nav modal-kitten-prev';
    prevBtn.textContent = '‹ ' + navCopy.previous;
    prevBtn.title = navCopy.previousTitle;
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      for (let i = currentKittenIndex - 1; i >= 0; i--) {
        if (!allKittenCards[i].classList.contains('hidden')) { openKittenByIndex(i); break; }
      }
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'modal-kitten-nav modal-kitten-next';
    nextBtn.textContent = navCopy.next + ' ›';
    nextBtn.title = navCopy.nextTitle;
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      for (let i = currentKittenIndex + 1; i < allKittenCards.length; i++) {
        if (!allKittenCards[i].classList.contains('hidden')) { openKittenByIndex(i); break; }
      }
    });

    kittenModal.appendChild(prevBtn);
    kittenModal.appendChild(nextBtn);
  }

  // Keyboard nav: left/right arrow keys for prev/next kitten
  document.addEventListener('keydown', e => {
    if (!kittenModal?.classList.contains('active')) return;
    if (e.key === 'ArrowLeft') {
      for (let i = currentKittenIndex - 1; i >= 0; i--) {
        if (!allKittenCards[i].classList.contains('hidden')) { openKittenByIndex(i); break; }
      }
    } else if (e.key === 'ArrowRight') {
      for (let i = currentKittenIndex + 1; i < allKittenCards.length; i++) {
        if (!allKittenCards[i].classList.contains('hidden')) { openKittenByIndex(i); break; }
      }
    }
  });

  // Close modal
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      closeModalA11y(kittenModal);
    });
  }
  if (kittenModal) {
    kittenModal.addEventListener('click', e => {
      if (e.target === kittenModal) {
        closeModalA11y(kittenModal);
      }
    });
  }

  // ===== Parent Detail Modal =====
  const parentModal = document.getElementById('parentModal');
  const parentModalClose = document.getElementById('parentModalClose');
  let parentOffspringRenderToken = 0;

  function getSharedParentKittens() {
    const api = window.FULUCK_API_BASE || 'https://fuluck-api.mouxue56.workers.dev';
    const store = window.FuluckPublicData || (window.FuluckPublicData = {});
    const requests = store.kittenRequests || (store.kittenRequests = Object.create(null));
    const url = api + '/api/kittens';
    if (!requests[url]) {
      const request = fetch(url)
        .then(response => {
          if (!response || response.ok !== true) throw new Error('Parent offspring request failed');
          return response.json();
        })
        .then(data => {
          if (!Array.isArray(data)) throw new Error('Parent offspring payload must be an array');
          return data;
        });
      requests[url] = request;
      request.catch(() => {
        if (requests[url] === request) delete requests[url];
      });
    }
    return requests[url];
  }

  function appendParentOffspring(container, kitten, copy) {
    const status = window.FuluckKittenCatalog.normalizeStatus(kitten && kitten.status);
    const breederId = typeof kitten?.breederId === 'string' ? kitten.breederId : '';
    const id = breederId || (typeof kitten?.id === 'string' ? kitten.id : '');
    const canLink = (status === 'available' || status === 'reserved')
      && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
    const row = createModalNode(canLink ? 'a' : 'span', 'child-chip');
    if (canLink) {
      const lang = String(document.documentElement?.lang || 'ja').toLowerCase();
      const localePrefix = lang.startsWith('en') ? '/en' : lang.startsWith('zh') ? '/zh' : '';
      row.setAttribute('href', localePrefix + '/kittens/' + encodeURIComponent(id) + '.html');
    }

    const facts = [];
    const breed = typeof kitten?.breed === 'string' ? kitten.breed.trim() : '';
    const color = typeof kitten?.color === 'string' ? kitten.color.trim() : '';
    const birthday = typeof kitten?.birthday === 'string' ? kitten.birthday.trim() : '';
    if (breed) facts.push(breed);
    if (color) facts.push(color);
    if (birthday) facts.push(birthday);
    const statusLabel = copy.status[status] || copy.status.sold;
    row.textContent = (facts.join(' ・ ') || id || copy.parentFallback) + ' (' + statusLabel + ')';
    container.appendChild(row);
  }

  window.openParentModal = async function(card) {
    if (!parentModal) return;
    const name = card.dataset.name || '';
    const breed = card.dataset.breed || '';
    const gender = card.dataset.gender || '';
    const role = card.dataset.role || '';
    const age = card.dataset.age || '';
    const color = card.dataset.color || '';
    const tested = card.dataset.tested === 'true';
    const copy = getKittenModalCopy();

    const nameEl = parentModal.querySelector('.modal-name');
    if (nameEl) nameEl.textContent = name;

    const roleEl = parentModal.querySelector('.parent-role');
    if (roleEl) {
      roleEl.textContent = gender === '♂' ? copy.parentFather : gender === '♀' ? copy.parentMother : role;
      roleEl.className = 'parent-role ' + (gender === '♂' ? 'role-papa' : 'role-mama');
    }

    // Build photo carousel for parent modal
    const gallery = parentModal.querySelector('.modal-gallery');
    if (gallery) {
      let images = safeModalMediaList(card.dataset.images || '');

      // If no images yet but has Drive folder, load from Drive
      if (images.length === 0 && /^[A-Za-z0-9_-]+$/.test(card.dataset.driveFolder || '') && window.DriveLoader) {
        buildMediaCarousel(gallery, [], '', name || copy.parentFallback, {
          placeholderClass: 'parent-modal-ph',
          emptyMessage: copy.photosLoading
        });
        const driveUrls = await window.DriveLoader.loadCardImages(card);
        if (driveUrls) {
          images = safeModalMediaList(driveUrls);
        }
      }

      buildMediaCarousel(gallery, images, '', name || copy.parentFallback, {
        placeholderClass: 'parent-modal-ph',
        emptyMessage: copy.photosPreparing
      });
    }

    // Update details
    const details = parentModal.querySelector('.modal-details');
    if (details) {
      details.replaceChildren();
      appendModalDetail(details, copy.breed, breed);
      appendModalDetail(details, copy.sex, gender === '♂' ? copy.male : gender === '♀' ? copy.female : '');
      if (color) appendModalDetail(details, copy.color, color);
      if (age) appendModalDetail(details, copy.age, age);
      appendModalDetail(details, copy.testInfo, tested ? copy.testRecorded : copy.testMissing, tested ? { icon: 'ico-circle-check' } : {});
    }

    // Resolve offspring from the same authenticated-safe public snapshot used by
    // the catalogue widgets. DOM cards are only a static fallback and can be
    // incomplete, so they must not decide whether a parent has offspring.
    const childrenContainer = parentModal.querySelector('.children-chips');
    if (childrenContainer) {
      childrenContainer.replaceChildren();
      childrenContainer.setAttribute('aria-busy', 'true');
      const loading = createModalNode('span', 'parent-offspring-state', copy.childrenLoading);
      loading.style.color = 'var(--text-note)';
      loading.style.fontSize = '13px';
      childrenContainer.appendChild(loading);
    }

    openModalA11y(parentModal);

    if (childrenContainer) {
      const renderToken = ++parentOffspringRenderToken;
      const field = gender === '♂' ? 'papa' : gender === '♀' ? 'mama' : '';
      try {
        const kittens = await getSharedParentKittens();
        if (renderToken !== parentOffspringRenderToken) return;
        const children = window.FuluckKittenCatalog.orderKittens(kittens)
          .filter(kitten => kitten && (field
            ? kitten[field] === name
            : kitten.papa === name || kitten.mama === name));
        childrenContainer.replaceChildren();
        children.forEach(child => appendParentOffspring(childrenContainer, child, copy));
        if (children.length === 0) {
          const empty = createModalNode('span', 'parent-offspring-state', copy.noChildren);
          empty.style.color = 'var(--text-note)';
          empty.style.fontSize = '13px';
          childrenContainer.appendChild(empty);
        }
        childrenContainer.setAttribute('aria-busy', 'false');
      } catch (error) {
        if (renderToken !== parentOffspringRenderToken) return;
        childrenContainer.replaceChildren();
        const failed = createModalNode('span', 'parent-offspring-state', copy.childrenError);
        failed.style.color = 'var(--text-note)';
        failed.style.fontSize = '13px';
        childrenContainer.appendChild(failed);
        childrenContainer.setAttribute('aria-busy', 'false');
      }
    }
  };

  function parentCardFromLocationHash() {
    if (!window.location.hash.startsWith('#parent-')) return null;
    try {
      const parentName = decodeURIComponent(window.location.hash.slice('#parent-'.length));
      return findCardByDataset('.parent-card', 'name', parentName);
    } catch (error) {
      return null;
    }
  }

  if (parentModalClose) {
    parentModalClose.addEventListener('click', () => {
      closeModalA11y(parentModal);
    });
  }
  if (parentModal) {
    parentModal.addEventListener('click', e => {
      if (e.target === parentModal) {
        closeModalA11y(parentModal);
      }
    });
  }

  // Close any modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        closeModalA11y(m);
      });
    }
  });

  // ===== Auto-open parent modal from URL hash =====
  // e.g. parents.html#parent-しろくん → opens しろくん's modal
  const hashParentCard = parentCardFromLocationHash();
  if (hashParentCard && typeof window.openParentModal === 'function') {
    setTimeout(() => window.openParentModal(hashParentCard), 500);
  }

  // ===== FAQ Accordion =====
  document.querySelectorAll('.faq-item').forEach((item, idx) => {
    const q = item.querySelector('.faq-q');
    if (q) {
      // a11y: expose expand state and link Q → A (mirrors faq-page-loader.js)
      const panel = item.querySelector('.faq-a');
      if (panel) {
        if (!panel.id) panel.id = 'faq-a-static-' + idx;
        panel.setAttribute('role', 'region');
        q.setAttribute('aria-controls', panel.id);
      }
      q.setAttribute('aria-expanded', item.classList.contains('active') ? 'true' : 'false');
      q.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        document.querySelectorAll('.faq-item').forEach(fi => {
          fi.classList.remove('active');
          const fq = fi.querySelector('.faq-q');
          if (fq) fq.setAttribute('aria-expanded', 'false');
        });
        if (!isActive) {
          item.classList.add('active');
          q.setAttribute('aria-expanded', 'true');
        }
      });
    }
  });

  // ===== Premium Scroll Animations (Intersection Observer) =====
  const observerOptions = { threshold: 0.08, rootMargin: '0px 0px -80px 0px' };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.dataset.delay || 0;
        setTimeout(() => {
          el.style.transition = 'opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          el.style.opacity = '1';
          el.style.transform = 'translateY(0) translateX(0)';
        }, delay);
        observer.unobserve(el);
      }
    });
  }, observerOptions);

  // Animate grid items with stagger
  const animTargets = document.querySelectorAll(
    '.sec-header, .about-card, .feature-card, .kitten-card, .parent-card, ' +
    '.review-card, .visit-card, .flow-step, .faq-item, .gallery-item, ' +
    '.line-cta-card, .award-card, .insta-item'
  );

  animTargets.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    const parent = el.parentElement;
    const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [];
    const idx = siblings.indexOf(el);
    el.dataset.delay = (idx >= 0 ? idx : 0) * 80;
    observer.observe(el);
  });

  // Reveal left/right animations
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal-left, .reveal-right').forEach(el => {
    revealObserver.observe(el);
  });

  // ===== Counter Animation =====
  function animateCounter(el) {
    const text = el.textContent.trim();
    const match = text.match(/(\d+)/);
    if (!match) return;
    const target = parseInt(match[1]);
    const prefix = text.substring(0, text.indexOf(match[1]));
    const suffix = text.substring(text.indexOf(match[1]) + match[1].length);
    let current = 0;
    const step = Math.ceil(target / 40);
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(timer); }
      el.textContent = prefix + current + suffix;
    }, 30);
  }

  const heroStats = document.querySelector('.hero-stats');
  if (heroStats) {
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('.stat-number').forEach((num, i) => {
            setTimeout(() => animateCounter(num), i * 200);
          });
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    statsObserver.observe(heroStats);
  }

  // ===== Mouse Follow Glow Effect =====
  document.querySelectorAll('.about-card, .kitten-card, .review-card, .award-card').forEach(card => {
    // Create glow element
    const glow = document.createElement('div');
    glow.className = 'card-glow';
    card.appendChild(glow);

    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      glow.style.left = (e.clientX - rect.left) + 'px';
      glow.style.top = (e.clientY - rect.top) + 'px';
    });
  });

  // ===== Parallax Floating Shapes =====
  document.querySelectorAll('.parallax-bg').forEach(bg => {
    const shapes = bg.querySelectorAll('.shape');
    window.addEventListener('scroll', () => {
      const rect = bg.parentElement.getBoundingClientRect();
      const ratio = rect.top / window.innerHeight;
      shapes.forEach((shape, i) => {
        const speed = (i + 1) * 0.15;
        shape.style.transform = `translateY(${ratio * speed * 100}px)`;
      });
    }, { passive: true });
  });

  // ===== Smooth Scroll =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ===== Active Nav Link on Scroll =====
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      if (window.scrollY >= section.offsetTop - 120) {
        current = section.getAttribute('id');
      }
    });
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) link.classList.add('active');
    });
  }, { passive: true });

  // ===== Fixed LINE Button =====
  const fixedLine = document.getElementById('fixedLine');
  if (fixedLine) {
    window.addEventListener('scroll', () => {
      fixedLine.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
  }

  // ===== Back to Top Button =====
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 800);
    }, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== Hero Float Parallax =====
  const floats = document.querySelectorAll('.hero-float');
  if (floats.length > 0 && window.innerWidth > 768) {
    window.addEventListener('scroll', () => {
      floats.forEach((f, i) => {
        f.style.transform = `translateY(${window.scrollY * (i + 1) * 0.3}px)`;
      });
    }, { passive: true });
  }

  // ===== Dynamic Card Rebinding (for card-loader.js) =====

  // Re-bind kitten card click events after dynamic rendering
  // On kittens.html (has .page-hero): navigate to detail page if available
  // On index.html: open modal as before
  window.bindKittenCards = function() {
    allKittenCards = Array.from(document.querySelectorAll('.kitten-card'));
    allKittenCards.forEach((card) => {
      const detailUrl = card.dataset.detailUrl || card.getAttribute('data-detail-url') || '';
      // Small-animal cards share the visual class but own native links and no cat modal.
      if (!kittenModal && !detailUrl) return;
      const role = isKittensPage && detailUrl ? 'link' : 'button';
      bindCardActivation(card, role, () => activateKittenCard(card));
    });
    updateKittenCount();
  };

  // Re-bind parent card click events after dynamic rendering
  window.bindParentCards = function() {
    if (!parentModal) return;
    document.querySelectorAll('.parent-card').forEach(card => {
      // Remove inline onclick to avoid double-fire, then bind via JS
      card.removeAttribute('onclick');
      card.style.cursor = 'pointer';
      bindCardActivation(card, 'button', () => {
        if (typeof window.openParentModal === 'function') {
          window.openParentModal(card);
        }
      });
    });
  };

  // Bind the static SEO fallback too. API-rendered replacements call rebindCards().
  window.bindKittenCards();
  window.bindParentCards();

  // Re-bind scroll animations for dynamically loaded cards
  window.bindAnimations = function() {
    const dynTargets = document.querySelectorAll(
      '.kitten-card, .parent-card, .review-card'
    );
    dynTargets.forEach(el => {
      // Only set up animation if not already observed
      if (el.dataset.animated) return;
      el.dataset.animated = '1';
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      const parent = el.parentElement;
      const siblings = parent ? Array.from(parent.children).filter(c => c.tagName === el.tagName) : [];
      const idx = siblings.indexOf(el);
      el.dataset.delay = (idx >= 0 ? idx : 0) * 80;
      observer.observe(el);
    });
    // Also add mouse glow effect to new cards
    document.querySelectorAll('.kitten-card, .review-card').forEach(card => {
      if (card.querySelector('.card-glow')) return; // already has glow
      const glow = document.createElement('div');
      glow.className = 'card-glow';
      card.appendChild(glow);
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        glow.style.left = (e.clientX - rect.left) + 'px';
        glow.style.top = (e.clientY - rect.top) + 'px';
      });
    });
  };

  // Master rebind function — called by card-loader.js after dynamic rendering
  window.rebindCards = function() {
    window.bindKittenCards();
    window.bindParentCards();
    window.bindAnimations();
    // Re-check hash for parent modal auto-open
    const targetCard = parentCardFromLocationHash();
    if (targetCard && typeof window.openParentModal === 'function') {
      setTimeout(() => window.openParentModal(targetCard), 300);
    }
  };

});

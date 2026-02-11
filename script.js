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

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });

    document.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        mobileNav.classList.remove('active');
        document.body.style.overflow = '';
      });
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
      line.innerHTML = '';
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

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      // Use live DOM query so dynamically loaded cards are included
      const liveCards = document.querySelectorAll('.kitten-card');

      liveCards.forEach((card, i) => {
        if (filter === 'all' || card.dataset.status === filter) {
          card.classList.remove('hidden');
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, i * 80);
        } else {
          card.classList.add('hidden');
        }
      });
      setTimeout(updateKittenCount, 100);
    });
  });

  // ===== Kitten Sorting =====
  const sortBtns = document.querySelectorAll('.sort-btn');
  const kittensGridEl = document.getElementById('kittensGrid');

  if (kittensGridEl) {
    sortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sortBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sortType = btn.dataset.sort;
        const cards = Array.from(kittensGridEl.querySelectorAll('.kitten-card'));

        cards.sort((a, b) => {
          switch (sortType) {
            case 'price-asc':
              return parseInt(a.dataset.price || 0) - parseInt(b.dataset.price || 0);
            case 'price-desc':
              return parseInt(b.dataset.price || 0) - parseInt(a.dataset.price || 0);
            case 'newest':
              return (b.dataset.birthday || '').localeCompare(a.dataset.birthday || '');
            default:
              return 0;
          }
        });

        cards.forEach((card, i) => {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          kittensGridEl.appendChild(card);
          setTimeout(() => {
            card.style.transition = 'all 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, i * 60);
        });
      });
    });
  }

  // ===== Dynamic Kitten Detail Modal =====
  const kittenModal = document.getElementById('kittenModal');
  const modalClose = document.getElementById('modalClose');

  async function buildCarousel(card) {
    if (!kittenModal) return;
    let images = card.dataset.images ? card.dataset.images.split(',') : [];
    const videoRaw = card.dataset.video || '';
    const gallery = kittenModal.querySelector('.modal-gallery');
    if (!gallery) return;

    // If no hardcoded images but has Drive folder, load from Drive
    if (images.length === 0 && card.dataset.driveFolder && window.DriveLoader) {
      gallery.innerHTML = '<div class="carousel-slide active"><div class="img-placeholder kit-modal-ph"><span>⏳</span><p>読み込み中...</p></div></div>';
      const driveUrls = await window.DriveLoader.loadCardImages(card);
      if (driveUrls) {
        images = driveUrls.split(',');
      }
    }

    // Parse YouTube embed: accept iframe embed code, youtu.be/xxx, or youtube.com/watch?v=xxx
    let videoEmbedUrl = '';
    if (videoRaw) {
      const iframeSrcMatch = videoRaw.match(/src=["']([^"']+)["']/);
      if (iframeSrcMatch) {
        videoEmbedUrl = iframeSrcMatch[1];
      } else if (videoRaw.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)) {
        videoEmbedUrl = 'https://www.youtube.com/embed/' + videoRaw.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)[1];
      } else if (videoRaw.match(/[?&]v=([a-zA-Z0-9_-]+)/)) {
        videoEmbedUrl = 'https://www.youtube.com/embed/' + videoRaw.match(/[?&]v=([a-zA-Z0-9_-]+)/)[1];
      } else if (videoRaw.match(/youtube\.com\/embed\//)) {
        videoEmbedUrl = videoRaw.trim();
      }
    }

    // Build slides
    let slidesHTML = '';
    let dotsHTML = '';
    let thumbsHTML = '';

    if (images.length === 0 && !videoEmbedUrl) {
      // Fallback placeholder
      slidesHTML = '<div class="carousel-slide active"><div class="img-placeholder kit-modal-ph" style="background:linear-gradient(135deg,#f0faf7,#fef6f0);"><span style="font-size:3rem;opacity:0.4;">🐱</span><p style="opacity:0.5;">写真を読み込み中...</p></div></div>';
      dotsHTML = '<span class="dot active"></span>';
      thumbsHTML = '<div class="thumb active"><div class="img-placeholder thumb-ph"><span>🐱</span></div></div>';
    } else if (images.length === 0 && videoEmbedUrl) {
      // Video only — make it the first active slide
      slidesHTML = `<div class="carousel-slide active"><div class="video-wrapper"><iframe src="${videoEmbedUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy"></iframe></div></div>`;
      dotsHTML = '<span class="dot video-dot active">▶</span>';
      thumbsHTML = '<div class="thumb video-thumb active"><div class="img-placeholder thumb-ph" style="background:linear-gradient(135deg,#c4302b,#ff6b6b);color:white;"><span>▶</span></div></div>';
    } else {
      images.forEach((img, i) => {
        const activeClass = i === 0 ? ' active' : '';
        slidesHTML += `<div class="carousel-slide${activeClass}"><img src="${img.trim()}" alt="子猫の写真 ${i + 1}" loading="lazy"></div>`;
        dotsHTML += `<span class="dot${activeClass}"></span>`;
        thumbsHTML += `<div class="thumb${activeClass}"><img src="${img.trim()}" alt="サムネイル ${i + 1}"></div>`;
      });
      // Append video as last slide
      if (videoEmbedUrl) {
        slidesHTML += `<div class="carousel-slide"><div class="video-wrapper"><iframe src="${videoEmbedUrl}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy"></iframe></div></div>`;
        dotsHTML += '<span class="dot video-dot">▶</span>';
        thumbsHTML += '<div class="thumb video-thumb"><div class="img-placeholder thumb-ph" style="background:linear-gradient(135deg,#c4302b,#ff6b6b);color:white;"><span>▶</span></div></div>';
      }
    }

    gallery.innerHTML = `
      <div class="carousel">
        <div class="carousel-main">${slidesHTML}</div>
        <button class="carousel-btn carousel-prev">‹</button>
        <button class="carousel-btn carousel-next">›</button>
        <div class="carousel-dots">${dotsHTML}</div>
      </div>
      <div class="carousel-thumbs">${thumbsHTML}</div>
    `;

    // Init carousel controls
    initCarousel(gallery);
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
    const status = card.dataset.status || 'available';
    const isNew = card.dataset.new === 'true';
    const papa = card.dataset.papa || '';
    const mama = card.dataset.mama || '';
    const breederId = card.dataset.breederId || '';
    const isSold = status === 'sold';

    const statusLabels = { available: '販売中', reserved: '商談中', sold: 'ご家族決定' };
    const statusClasses = { available: 'st-available', reserved: 'st-reserved', sold: 'st-sold' };

    info.innerHTML = `
      <div class="modal-status-row">
        <span class="kit-status ${statusClasses[status]}">${statusLabels[status]}</span>
        ${isNew ? '<span class="kit-badge-new">NEW</span>' : ''}
      </div>
      <h2 class="modal-name">${displayName}</h2>
      ${!isSold ? `<div class="modal-price-row"><span class="modal-price">${price.replace(/（税込）/, '')}</span><span class="tax">（税込）</span></div>` : '<p class="sold-text" style="margin-bottom:20px">ご家族が決まりました</p>'}

      <div class="modal-details">
        <div class="detail-row"><span class="detail-label">猫種</span><span class="detail-value">${breed}</span></div>
        <div class="detail-row"><span class="detail-label">性別</span><span class="detail-value">${gender.split('・')[0]?.trim() || ''}</span></div>
        <div class="detail-row"><span class="detail-label">カラー</span><span class="detail-value">${gender.split('・')[1]?.trim() || ''}</span></div>
        <div class="detail-row"><span class="detail-label">誕生日</span><span class="detail-value">${birthday}</span></div>
        <div class="detail-row"><span class="detail-label">ワクチン</span><span class="detail-value">1回接種済み</span></div>
        <div class="detail-row"><span class="detail-label">遺伝子検査</span><span class="detail-value">PKD(-) HCM(-)</span></div>
        ${breederId ? `<div class="detail-row"><span class="detail-label">掲載ID</span><span class="detail-value" style="color:var(--mint);font-weight:600">${breederId}</span></div>` : ''}
      </div>

      ${papa || mama ? `
      <div class="modal-parents">
        <h4>両親</h4>
        <div class="modal-parent-row">
          ${papa ? `<div class="modal-parent-chip clickable" data-parent-name="${papa}"><span class="parent-chip-icon">♂</span><span>パパ: ${papa}</span></div>` : ''}
          ${mama ? `<div class="modal-parent-chip clickable" data-parent-name="${mama}"><span class="parent-chip-icon">♀</span><span>ママ: ${mama}</span></div>` : ''}
        </div>
      </div>` : ''}

      <div class="modal-health">
        <h4>健康情報</h4>
        <div class="health-tags">
          <span class="health-tag tag-good">✓ ワクチン接種済</span>
          <span class="health-tag tag-good">✓ 遺伝子検査済</span>
          <span class="health-tag tag-good">✓ 健康診断済</span>
          <span class="health-tag tag-good">✓ 駆虫済み</span>
        </div>
      </div>

      <div class="law-notice-compact">
        <div class="law-notice-title">📋 動物愛護管理法に基づく対面販売</div>
        <p>法律の規定により、ご購入前に必ずキャッテリーにお越しいただき、子猫と対面していただく必要がございます。</p>
      </div>

      <a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" class="btn btn-line modal-line-btn" target="_blank" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596a.626.626 0 0 1-.199.031c-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.173-.508.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
        まずはLINEで気軽に相談
      </a>
      <p style="text-align:center;font-size:12px;color:var(--text-note);margin-top:6px;">※ 購入前のちょっとした質問だけでもOKです</p>

      <div class="modal-actions" style="margin-top:12px">
        <a href="#visit" class="btn btn-secondary modal-visit-btn" onclick="document.getElementById('kittenModal').classList.remove('active');document.body.style.overflow=''">見学を予約</a>
      </div>
    `;

    // Make parent chips clickable — find matching parent card and open modal
    info.querySelectorAll('.modal-parent-chip.clickable').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const parentName = chip.dataset.parentName;
        if (!parentName) return;

        // Try to find the parent card on this page
        const parentCard = document.querySelector(`.parent-card[data-name="${parentName}"]`);
        if (parentCard && typeof window.openParentModal === 'function') {
          // Close kitten modal, open parent modal
          kittenModal.classList.remove('active');
          window.openParentModal(parentCard);
        } else {
          // Not on this page — navigate to parents.html with hash
          kittenModal.classList.remove('active');
          document.body.style.overflow = '';
          window.location.href = `parents.html#parent-${encodeURIComponent(parentName)}`;
        }
      });
    });
  }

  // ===== Kitten Modal Navigation (prev/next kitten) =====
  let allKittenCards = Array.from(document.querySelectorAll('.kitten-card'));
  let currentKittenIndex = -1;

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
    const prevBtn = document.createElement('button');
    prevBtn.className = 'modal-kitten-nav modal-kitten-prev';
    prevBtn.innerHTML = '‹ 前';
    prevBtn.title = '前の子猫';
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      for (let i = currentKittenIndex - 1; i >= 0; i--) {
        if (!allKittenCards[i].classList.contains('hidden')) { openKittenByIndex(i); break; }
      }
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'modal-kitten-nav modal-kitten-next';
    nextBtn.innerHTML = '次 ›';
    nextBtn.title = '次の子猫';
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      for (let i = currentKittenIndex + 1; i < allKittenCards.length; i++) {
        if (!allKittenCards[i].classList.contains('hidden')) { openKittenByIndex(i); break; }
      }
    });

    kittenModal.appendChild(prevBtn);
    kittenModal.appendChild(nextBtn);
  }

  // Open kitten modal
  allKittenCards.forEach((card, idx) => {
    card.addEventListener('click', () => {
      if (!kittenModal) return;
      currentKittenIndex = idx;
      buildCarousel(card);
      populateModalInfo(card);
      kittenModal.classList.add('active');
      document.body.style.overflow = 'hidden';
      updateKittenNavButtons();
    });
  });

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
      kittenModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  }
  if (kittenModal) {
    kittenModal.addEventListener('click', e => {
      if (e.target === kittenModal) {
        kittenModal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // ===== Parent Detail Modal =====
  const parentModal = document.getElementById('parentModal');
  const parentModalClose = document.getElementById('parentModalClose');

  window.openParentModal = function(card) {
    if (!parentModal) return;
    const name = card.dataset.name || '';
    const breed = card.dataset.breed || '';
    const gender = card.dataset.gender || '';
    const role = card.dataset.role || '';
    const age = card.dataset.age || '';
    const color = card.dataset.color || '';
    const tested = card.dataset.tested === 'true';

    const nameEl = parentModal.querySelector('.modal-name');
    if (nameEl) nameEl.textContent = name;

    const roleEl = parentModal.querySelector('.parent-role');
    if (roleEl) {
      roleEl.textContent = role;
      roleEl.className = 'parent-role ' + (gender === '♂' ? 'role-papa' : 'role-mama');
    }

    // Update details
    const details = parentModal.querySelector('.modal-details');
    if (details) {
      details.innerHTML = `
        <div class="detail-row"><span class="detail-label">猫種</span><span class="detail-value">${breed}</span></div>
        <div class="detail-row"><span class="detail-label">性別</span><span class="detail-value">${gender} ${gender === '♂' ? '男の子' : '女の子'}</span></div>
        ${color ? `<div class="detail-row"><span class="detail-label">カラー</span><span class="detail-value">${color}</span></div>` : ''}
        ${age ? `<div class="detail-row"><span class="detail-label">年齢</span><span class="detail-value">${age}</span></div>` : ''}
        <div class="detail-row"><span class="detail-label">遺伝子検査</span><span class="detail-value">${tested ? '✅ PKD(-) HCM(-) 検査済み' : '検査予定'}</span></div>
      `;
    }

    // Find children kittens
    const childrenContainer = parentModal.querySelector('.children-chips');
    if (childrenContainer) {
      const parentName = name;
      const field = gender === '♂' ? 'papa' : 'mama';
      const children = document.querySelectorAll(`.kitten-card[data-${field}="${parentName}"]`);
      let chipsHTML = '';
      children.forEach(child => {
        const childName = child.querySelector('h3')?.textContent || '';
        const childMeta = child.querySelector('.kit-meta')?.textContent || '';
        const childStatus = child.dataset.status || '';
        const statusLabel = { available: '販売中', reserved: '商談中', sold: 'ご家族決定' }[childStatus] || '';
        chipsHTML += `<span class="child-chip">${childName} ${childMeta} (${statusLabel})</span>`;
      });
      childrenContainer.innerHTML = chipsHTML || '<span style="color:var(--text-note);font-size:13px">現在表示中の子猫はいません</span>';
    }

    parentModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  if (parentModalClose) {
    parentModalClose.addEventListener('click', () => {
      parentModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  }
  if (parentModal) {
    parentModal.addEventListener('click', e => {
      if (e.target === parentModal) {
        parentModal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // Close any modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active');
        document.body.style.overflow = '';
      });
    }
  });

  // ===== Auto-open parent modal from URL hash =====
  // e.g. parents.html#parent-しろくん → opens しろくん's modal
  if (window.location.hash.startsWith('#parent-')) {
    const parentName = decodeURIComponent(window.location.hash.replace('#parent-', ''));
    const targetCard = document.querySelector(`.parent-card[data-name="${parentName}"]`);
    if (targetCard && typeof window.openParentModal === 'function') {
      setTimeout(() => window.openParentModal(targetCard), 500);
    }
  }

  // ===== FAQ Accordion =====
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    if (q) {
      q.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        document.querySelectorAll('.faq-item').forEach(fi => fi.classList.remove('active'));
        if (!isActive) item.classList.add('active');
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
  var isKittensPage = !!document.querySelector('.page-hero');
  window.bindKittenCards = function() {
    allKittenCards = Array.from(document.querySelectorAll('.kitten-card'));
    allKittenCards.forEach((card, idx) => {
      card.addEventListener('click', () => {
        var detailUrl = card.getAttribute('data-detail-url');
        if (isKittensPage && detailUrl) {
          // Navigate to individual kitten detail page
          window.location.href = detailUrl;
          return;
        }
        // Fallback: open modal (index.html or no detail URL)
        if (!kittenModal) return;
        currentKittenIndex = idx;
        buildCarousel(card);
        populateModalInfo(card);
        kittenModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        updateKittenNavButtons();
      });
    });
    updateKittenCount();
  };

  // Re-bind parent card click events after dynamic rendering
  window.bindParentCards = function() {
    document.querySelectorAll('.parent-card').forEach(card => {
      // Remove inline onclick to avoid double-fire, then bind via JS
      card.removeAttribute('onclick');
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        if (typeof window.openParentModal === 'function') {
          window.openParentModal(card);
        }
      });
    });
  };

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
    if (window.location.hash.startsWith('#parent-')) {
      const parentName = decodeURIComponent(window.location.hash.replace('#parent-', ''));
      const targetCard = document.querySelector(`.parent-card[data-name="${parentName}"]`);
      if (targetCard && typeof window.openParentModal === 'function') {
        setTimeout(() => window.openParentModal(targetCard), 300);
      }
    }
  };

});

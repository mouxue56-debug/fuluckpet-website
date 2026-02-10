/* ========================================
   福楽キャッテリー - Google Drive Image Loader
   Loads cat photos from Drive via Worker API

   自動マッチング:
   - kitten-card[data-breeder-id] → kittens/{breederId} フォルダを検索
   - parent-card[data-name]       → parents/{catName} フォルダを検索
   - Drive にフォルダがあれば自動的にカバー画像を差し替え
   - なければ既存の画像をそのまま使用（優雅降級）
   ======================================== */

(function () {
  'use strict';

  // Worker API base URL
  const API_BASE = window.FULUCK_API_BASE || '';
  if (!API_BASE) return; // API URL not configured, skip Drive loading entirely

  // Drive folder IDs (set via window.FULUCK_DRIVE_FOLDERS or auto-discovered)
  const DRIVE_FOLDERS = window.FULUCK_DRIVE_FOLDERS || {};

  // In-memory cache for image lists and folder lookups (per page session)
  const cache = new Map();

  // ===== API helpers =====

  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  }

  // List subfolders of a Drive folder (cached)
  async function getSubfolders(parentFolderId) {
    const key = `folders:${parentFolderId}`;
    if (cache.has(key)) return cache.get(key);

    const folders = await fetchJSON(`${API_BASE}/api/drive/folders/${parentFolderId}`);
    if (folders) cache.set(key, folders);
    return folders || [];
  }

  // List images in a Drive folder (cached)
  async function getImages(folderId) {
    const key = `images:${folderId}`;
    if (cache.has(key)) return cache.get(key);

    const images = await fetchJSON(`${API_BASE}/api/drive/images/${folderId}`);
    if (images) cache.set(key, images);
    return images || [];
  }

  // Build full image URL from file ID
  function imgUrl(fileId) {
    return `${API_BASE}/api/drive/img/${fileId}`;
  }

  // Find a named subfolder inside a parent folder (cached lookup)
  async function findSubfolder(parentFolderId, folderName) {
    const folders = await getSubfolders(parentFolderId);
    return folders.find(f => f.name === folderName) || null;
  }

  // ===== Card image loading =====

  // Load Drive images for a card that has data-drive-folder set
  async function loadCardImages(card) {
    const folderId = card.dataset.driveFolder;
    if (!folderId) return null;

    const images = await getImages(folderId);
    if (images.length === 0) return null;

    // Update card cover image
    const coverImg = card.querySelector('.kitten-img img, .parent-img img, img');
    if (coverImg) {
      coverImg.src = imgUrl(images[0].id);
    }

    // Return comma-separated URLs for carousel
    return images.map(img => imgUrl(img.id)).join(',');
  }

  // ===== Auto-discovery: scan page and match cards to Drive folders =====

  async function autoDiscoverKittens() {
    if (!DRIVE_FOLDERS.kittens) return;

    // Get all subfolder names under kittens/
    const kittenFolders = await getSubfolders(DRIVE_FOLDERS.kittens);
    if (!kittenFolders || kittenFolders.length === 0) return;

    // Build name→id map for fast lookup
    const folderMap = new Map();
    kittenFolders.forEach(f => folderMap.set(f.name, f.id));

    // Scan all kitten cards on the page
    const cards = document.querySelectorAll('.kitten-card[data-breeder-id]');
    const updates = [];

    cards.forEach(card => {
      const breederId = card.dataset.breederId;
      if (!breederId) return;

      const folderId = folderMap.get(breederId);
      if (!folderId) return; // No Drive folder for this kitten, keep original image

      // Mark this card as Drive-linked
      card.dataset.driveFolder = folderId;

      // Queue cover image update
      updates.push(updateCardCover(card, folderId));
    });

    // Load all cover images in parallel
    await Promise.allSettled(updates);
  }

  async function autoDiscoverParents() {
    if (!DRIVE_FOLDERS.parents) return;

    const parentFolders = await getSubfolders(DRIVE_FOLDERS.parents);
    if (!parentFolders || parentFolders.length === 0) return;

    const folderMap = new Map();
    parentFolders.forEach(f => folderMap.set(f.name, f.id));

    const cards = document.querySelectorAll('.parent-card[data-name]');
    const updates = [];

    cards.forEach(card => {
      const catName = card.dataset.name;
      if (!catName) return;

      const folderId = folderMap.get(catName);
      if (!folderId) return;

      card.dataset.driveFolder = folderId;
      updates.push(updateCardCover(card, folderId));
    });

    await Promise.allSettled(updates);
  }

  // Update a single card's cover image from Drive
  async function updateCardCover(card, folderId) {
    const images = await getImages(folderId);
    if (images.length === 0) return;

    const coverImg = card.querySelector('img');
    if (coverImg) {
      // Preload to avoid flash — swap only when new image is ready
      const newUrl = imgUrl(images[0].id);
      const preload = new Image();
      preload.onload = () => { coverImg.src = newUrl; };
      preload.onerror = () => { /* keep original image */ };
      preload.src = newUrl;
    }

    // Also update data-images so modal carousel uses Drive photos
    const allUrls = images.map(img => imgUrl(img.id)).join(',');
    card.dataset.images = allUrls;
  }

  // ===== Initialize on page load =====

  async function init() {
    // Run kitten and parent discovery in parallel
    await Promise.allSettled([
      autoDiscoverKittens(),
      autoDiscoverParents(),
    ]);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===== Expose to global scope (for modal carousel) =====
  window.DriveLoader = {
    getImages,
    imgUrl,
    findSubfolder,
    loadCardImages,
  };
})();

import { isDeepStrictEqual } from 'node:util';

const ACTIVE_STATUSES = new Set(['available', 'reserved']);
const REQUIRED_CATALOGUE_TEXT = ['breederId', 'breed', 'color', 'gender'];
const REQUIRED_LOCALIZED_TEXT = [
  ['notes', 'ja'], ['notes', 'zh'], ['notes', 'en'],
  ['descriptions', 'ja'], ['descriptions', 'zh'], ['descriptions', 'en'],
];

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isCalendarDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function youtubeId(value) {
  if (!isNonBlankString(value)) return '';
  const match = value.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^\s#]*?&)?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})(?:[?&#/]|$)/,
  );
  return match ? match[1] : '';
}

export function canonicalizeYouTubeVideo(value) {
  const id = youtubeId(value);
  return id ? `https://www.youtube.com/embed/${id}` : '';
}

function sourceText(source, group, locale) {
  return source[group] && source[group][locale];
}

/**
 * Fail closed before an active Koneko source can be used for a strict mirror.
 * This function is deliberately pure so the CLI can run it before any remote read.
 */
export function assertCompleteActiveSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('active source must be an object');
  }
  if (!ACTIVE_STATUSES.has(source.status)) {
    throw new Error(`active source status must be available or reserved: ${source.status || '(missing)'}`);
  }
  for (const field of REQUIRED_CATALOGUE_TEXT) {
    if (!isNonBlankString(source[field])) throw new Error(`active source ${field} is required`);
  }
  if (!isPositiveInteger(source.price)) throw new Error('active source price must be a positive integer');
  if (!isCalendarDate(source.birthday)) throw new Error('active source birthday must be YYYY-MM-DD');
  if (!Array.isArray(source.photos) || source.photos.length === 0 || !source.photos.every(isNonBlankString)) {
    throw new Error('active source photos must contain at least one non-empty URL');
  }
  if (!canonicalizeYouTubeVideo(source.video)) {
    throw new Error('active source video must contain a valid YouTube ID');
  }
  for (const [group, locale] of REQUIRED_LOCALIZED_TEXT) {
    if (!isNonBlankString(sourceText(source, group, locale))) {
      throw new Error(`active source ${group}.${locale} is required`);
    }
  }
}

/**
 * Return only source-owned active fields that differ from the current Fuluck record.
 * Fuluck metadata such as IDs, timestamps, promotions, and internal notes is never read
 * into the result and therefore remains untouched by the item-scoped PUT.
 */
export function buildActiveMirrorPatch(current, source) {
  const patch = {};
  const currentRecord = current && typeof current === 'object' ? current : {};
  const sourceRecord = source && typeof source === 'object' ? source : {};

  for (const field of ['status', 'breed', 'color', 'gender', 'price', 'birthday', 'papa', 'mama']) {
    const wanted = sourceRecord[field] ?? '';
    if (!isDeepStrictEqual(currentRecord[field], wanted)) patch[field] = wanted;
  }

  const wantedPhotos = Array.isArray(sourceRecord.photos) ? [...sourceRecord.photos] : [];
  if (!isDeepStrictEqual(currentRecord.photos, wantedPhotos)) patch.photos = wantedPhotos;
  if (currentRecord.coverIndex !== 0) patch.coverIndex = 0;

  const wantedVideo = canonicalizeYouTubeVideo(sourceRecord.video);
  const currentVideoId = youtubeId(currentRecord.video);
  if (
    (wantedVideo && currentVideoId !== youtubeId(wantedVideo))
    || (!wantedVideo && (currentRecord.video ?? '') !== '')
  ) {
    patch.video = wantedVideo;
  }

  for (const [field, group, locale] of [
    ['note', 'notes', 'ja'],
    ['noteZh', 'notes', 'zh'],
    ['noteEn', 'notes', 'en'],
    ['description', 'descriptions', 'ja'],
    ['descriptionZh', 'descriptions', 'zh'],
    ['descriptionEn', 'descriptions', 'en'],
  ]) {
    const wanted = sourceText(sourceRecord, group, locale) ?? '';
    if (!isDeepStrictEqual(currentRecord[field], wanted)) patch[field] = wanted;
  }

  return patch;
}

/** Build the complete item body shared by strict-mode emit and POST paths. */
export function buildActiveMirrorRecord(source) {
  return {
    breederId: source.breederId,
    status: source.status,
    breed: source.breed,
    color: source.color,
    gender: source.gender,
    price: source.price,
    birthday: source.birthday,
    photos: [...source.photos],
    coverIndex: 0,
    video: canonicalizeYouTubeVideo(source.video),
    papa: source.papa ?? '',
    mama: source.mama ?? '',
    note: sourceText(source, 'notes', 'ja') ?? '',
    noteZh: sourceText(source, 'notes', 'zh') ?? '',
    noteEn: sourceText(source, 'notes', 'en') ?? '',
    description: sourceText(source, 'descriptions', 'ja') ?? '',
    descriptionZh: sourceText(source, 'descriptions', 'zh') ?? '',
    descriptionEn: sourceText(source, 'descriptions', 'en') ?? '',
    isNew: true,
  };
}

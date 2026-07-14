const DOG_PET_TYPES = Object.freeze(['dog_small', 'dog_medium', 'dog_large']);

function isDogCalendarEvent(event) {
  if (!event || typeof event !== 'object') return false;
  return DOG_PET_TYPES.includes(event.petType);
}

function dogCalendarWritesEnabled(env) {
  return !!(env && env.DOG_SERVICES_PUBLIC === 'true');
}

function canWriteDogCalendarEvent(event, env) {
  return !isDogCalendarEvent(event) || dogCalendarWritesEnabled(env);
}

function canWriteCalendarEvent(event, env) {
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'care') {
    if (event.petType === 'cat') return true;
    return isDogCalendarEvent(event) && dogCalendarWritesEnabled(env);
  }
  return canWriteDogCalendarEvent(event, env);
}

function canUpdateCalendarEvent(previousEvent, mergedEvent, env) {
  if (!previousEvent || typeof previousEvent !== 'object') return false;
  if (!mergedEvent || typeof mergedEvent !== 'object') return false;

  if (isDogCalendarEvent(previousEvent) && !dogCalendarWritesEnabled(env)) return false;
  if (
    previousEvent.type === 'care' &&
    previousEvent.petType !== 'cat' &&
    !isDogCalendarEvent(previousEvent)
  ) return false;

  return canWriteCalendarEvent(mergedEvent, env);
}

export {
  DOG_PET_TYPES,
  canUpdateCalendarEvent,
  canWriteCalendarEvent,
  canWriteDogCalendarEvent,
  dogCalendarWritesEnabled,
  isDogCalendarEvent,
};

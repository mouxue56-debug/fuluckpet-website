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

export { DOG_PET_TYPES, canWriteDogCalendarEvent, dogCalendarWritesEnabled, isDogCalendarEvent };

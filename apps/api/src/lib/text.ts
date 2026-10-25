const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a uuid — check before querying a uuid column with user input. */
export const isUuid = (value: string) => uuidPattern.test(value);

/** Escapes %, _ and \ so user input is matched literally in a LIKE / ILIKE pattern. */
export const escapeLike = (value: string) => value.replace(/[%_\\]/g, '\\$&');

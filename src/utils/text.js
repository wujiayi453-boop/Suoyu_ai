/**
 * text.js - text normalisation helpers.
 * Extracted verbatim from the legacy server.js lines L215-L232.
 */

function asText(value) {
  if (Array.isArray(value)) return asText(value[0]);
  if (value && typeof value === 'object') return asText(value.name || value.title || value.value || '');
  return value === undefined || value === null ? '' : String(value).trim();
}

function asList(value) {
  const items = Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
  return items.map(asText).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function firstText(...values) {
  return values.map(asText).find(Boolean) || '';
}

module.exports = { asText, asList, unique, firstText };

'use strict';

// JSON embedded in an HTML <script> context must not contain a literal "<".
// Otherwise a data value such as </script><script> can terminate the JSON-LD or
// bootstrap script even though JSON.stringify itself produced valid JSON.
function safeJsonForHtmlScript(value, space) {
  return JSON.stringify(value, null, space)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = { safeJsonForHtmlScript };

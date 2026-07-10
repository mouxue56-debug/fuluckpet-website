/**
 * API Client for Admin Panel — Worker KV backend
 * Provides apiGet/apiPost/apiPut/apiDelete with auth, retry, and localStorage fallback.
 */

var FuluckAPI = (function() {
  var BASE = 'https://fuluck-api.mouxue56.workers.dev';
  var MAX_RETRIES = 1;
  var TIMEOUT_MS = 10000;

  function getAuth() {
    return 'Bearer ' + (typeof getSessionPass === 'function' ? getSessionPass() : '');
  }

  function fetchWithTimeout(url, opts) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var requestOpts = {};
    Object.keys(opts || {}).forEach(function(key) {
      requestOpts[key] = opts[key];
    });
    if (controller) requestOpts.signal = controller.signal;

    return new Promise(function(resolve, reject) {
      var settled = false;
      var timerId;

      function settle(callback, value) {
        if (settled) return;
        settled = true;
        if (timerId !== undefined) clearTimeout(timerId);
        callback(value);
      }

      timerId = setTimeout(function() {
        if (settled) return;
        if (controller) controller.abort();
        settle(reject, new Error('timeout'));
      }, TIMEOUT_MS);

      try {
        Promise.resolve(fetch(url, requestOpts)).then(
          function(res) { settle(resolve, res); },
          function(err) { settle(reject, err); }
        );
      } catch (err) {
        settle(reject, err);
      }
    });
  }

  function request(method, path, body, retry) {
    retry = retry || 0;
    var opts = {
      method: method,
      headers: {
        'Authorization': getAuth(),
        'Content-Type': 'application/json'
      }
    };
    if (body !== undefined && body !== null) {
      opts.body = JSON.stringify(body);
    }

    return fetchWithTimeout(BASE + path, opts)
      .then(function(res) {
        if (!res.ok) {
          return res.text().then(function(t) {
            throw new Error('API ' + res.status + ': ' + t);
          });
        }
        return res.json();
      })
      .catch(function(err) {
        if (method === 'GET' && retry < MAX_RETRIES) {
          return request(method, path, body, retry + 1);
        }
        throw err;
      });
  }

  return {
    get: function(path) { return request('GET', path); },
    post: function(path, data) { return request('POST', path, data); },
    put: function(path, data) { return request('PUT', path, data); },
    del: function(path) { return request('DELETE', path); },

    // High-level: save a single entity (create or update)
    saveEntity: function(type, item) {
      if (!item.id || item.id.match(/^[kpr]\d+$/)) {
        // New item (local ID pattern) — create via POST
        return request('POST', '/api/admin/' + type, item);
      }
      // Existing item — update via PUT
      return request('PUT', '/api/admin/' + type + '/' + item.id, item);
    },

    deleteEntity: function(type, id) {
      return request('DELETE', '/api/admin/' + type + '/' + id);
    },

    // Bulk import — for migration
    bulkImport: function(type, items) {
      return request('POST', '/api/admin/' + type + '/bulk', items);
    },

    // Trigger static page regeneration via GitHub Actions
    publish: function() {
      return request('POST', '/api/admin/publish');
    },

    // Upload file to R2 (multipart/form-data) — returns { url, key }
    uploadFile: function(file, options) {
      var formData = new FormData();
      formData.append('file', file);
      if (options && options.prefix === 'small-animals') {
        formData.append('prefix', 'small-animals');
      }
      var opts = {
        method: 'POST',
        headers: { 'Authorization': getAuth() },
        body: formData
      };
      return fetchWithTimeout(BASE + '/api/admin/upload', opts)
        .then(function(res) {
          if (!res.ok) {
            return res.text().then(function(t) {
              throw new Error('Upload ' + res.status + ': ' + t);
            });
          }
          return res.json();
        });
    },

    // Delete only a Worker-generated upload key. The Worker independently validates
    // the closed key format and namespace before touching R2.
    deleteUpload: function(key) {
      return request('DELETE', '/api/admin/upload', { key: key });
    },

    // Check API availability
    ping: function() {
      return fetchWithTimeout(BASE + '/api/kittens', { method: 'GET' })
        .then(function(res) { return res.ok; })
        .catch(function() { return false; });
    }
  };
})();

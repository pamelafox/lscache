/**
 * lscache library
 * Copyright (c) 2011, Pamela Fox
 *
 * 6/6/2014 - isExpired/skipRemove/allowExpired additions by matt@brophy.org
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* jshint undef:true, browser:true, node:true */
/* global define */

(function (root, factory) {
  // Module export approach is taken from Lodash:
  // https://github.com/lodash/lodash/blob/505aa7e73027adb7df00f6226c38bdf1489cbf16/lodash.src.js#L12431
  
  /** Used to determine if values are of the language type `Object`. */
  var objectTypes = {
    'function': true,
    'object': true
  };

  /** Detect free variable `exports`. */
  var freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;

  // Some AMD build optimizers like r.js check for condition patterns like the following:
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // Expose lscacheExtra to the global object when an AMD loader is present to avoid
    // errors in cases where lscacheExtra is loaded by a script tag and not intended
    // as an AMD module. See http://requirejs.org/docs/errors.html#mismatch for
    // more details.
    root.lscacheExtra = factory();

    // AMD. Register as an anonymous module.
    define([], factory);
  }
  // Check for `exports` after `define` in case a build optimizer adds an `exports` object.
  else if (freeExports && freeModule) {
    // Export for Node.js or RingoJS.
    if (moduleExports) {
      freeModule.exports = factory();
    }
    // Export for Narwhal or Rhino -require.
    else {
      freeExports.lscacheExtra = factory();
    }
  }
  else {
    // Export for a browser or Rhino.
    root.lscacheExtra = factory();
  }
}(this, function () {

  // Prefix for all lscache keys
  var CACHE_PREFIX = 'lscache-';

  // Suffix for the key name on the expiration items in localStorage
  var CACHE_SUFFIX = '-cacheexpiration';

  // expiration date radix (set to Base-36 for most space savings)
  var EXPIRY_RADIX = 10;

  // time resolution in minutes
  var EXPIRY_UNITS = 60 * 1000;
  var EXPIRY_UNITS_KEY = '__expiry-units-key';

  // ECMAScript max Date (epoch + 1e8 days)
  var MAX_DATE = Math.floor(8.64e15/EXPIRY_UNITS);

  var cachedStorage;
  var cachedJSON;
  var cacheBucket = '';
  var warnings = false;

  // Determines if localStorage is supported in the browser;
  // result is cached for better performance instead of being run each time.
  // Feature detection is based on how Modernizr does it;
  // it's not straightforward due to FF4 issues.
  // It's not run at parse-time as it takes 200ms in Android.
  function supportsStorage() {
  var key = '__lscachetest__';
  var value = key;

  if (cachedStorage !== undefined) {
    return cachedStorage;
  }

  try {
    setItem(key, value);
    removeItem(key);
    cachedStorage = true;
  } catch (exc) {
    cachedStorage = false;
  }
  return cachedStorage;
  }

  // Determines if native JSON (de-)serialization is supported in the browser.
  function supportsJSON() {
  /*jshint eqnull:true */
  if (cachedJSON === undefined) {
    cachedJSON = (window.JSON != null);
  }
  return cachedJSON;
  }

  /**
   * Returns the full string for the localStorage expiration item.
   * @param {String} key
   * @return {string}
   */
  function expirationKey(key) {
  return key + CACHE_SUFFIX;
  }

  /**
   * Returns the number of minutes since the epoch.
   * @return {number}
   */
  function currentTime() {
  return Math.floor((new Date().getTime())/EXPIRY_UNITS);
  }

  /**
   * Wrapper functions for localStorage methods
   */

  function getItem(key) {
  return localStorage.getItem(CACHE_PREFIX + cacheBucket + key);
  }

  function setItem(key, value) {
  // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
  localStorage.removeItem(CACHE_PREFIX + cacheBucket + key);
  localStorage.setItem(CACHE_PREFIX + cacheBucket + key, value);
  }

  function removeItem(key) {
  localStorage.removeItem(CACHE_PREFIX + cacheBucket + key);
  }

  function warn(message, err) {
  if (!warnings) return;
  if (!('console' in window) || typeof window.console.warn !== 'function') return;
  window.console.warn("lscache - " + message);
  if (err) window.console.warn("lscache - The error was: " + err.message);
  }

  var lscache = {
  /**
   * Stores the value in localStorage. Expires after specified number of minutes.
   * @param {string} key
   * @param {Object|string} value
   * @param {number} time
   */
  set: function(key, value, time) {
    if (!supportsStorage()) return;

    // If we don't get a string value, try to stringify
    // In future, localStorage may properly support storing non-strings
    // and this can be removed.
    if (typeof value !== 'string') {
    if (!supportsJSON()) return;
    try {
      value = JSON.stringify(value);
    } catch (e) {
      // Sometimes we can't stringify due to circular refs
      // in complex objects, so we won't bother storing then.
      return;
    }
    }

    try {
    setItem(key, value);
    } catch (e) {
    if (e.name === 'QUOTA_EXCEEDED_ERR' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.name === 'QuotaExceededError') {
      // If we exceeded the quota, then we will sort
      // by the expire time, and then remove the N oldest
      var storedKeys = [];
      var storedKey;
      for (var i = 0; i < localStorage.length; i++) {
      storedKey = localStorage.key(i);

      if (storedKey.indexOf(CACHE_PREFIX + cacheBucket) === 0 && storedKey.indexOf(CACHE_SUFFIX) < 0) {
        var mainKey = storedKey.substr((CACHE_PREFIX + cacheBucket).length);
        var exprKey = expirationKey(mainKey);
        var expiration = getItem(exprKey);
        if (expiration) {
        expiration = parseInt(expiration, EXPIRY_RADIX);
        } else {
        // TODO: Store date added for non-expiring items for smarter removal
        expiration = MAX_DATE;
        }
        storedKeys.push({
        key: mainKey,
        size: (getItem(mainKey)||'').length,
        expiration: expiration
        });
      }
      }
      // Sorts the keys with oldest expiration time last
      storedKeys.sort(function(a, b) { return (b.expiration-a.expiration); });

      var targetSize = (value||'').length;
      while (storedKeys.length && targetSize > 0) {
      storedKey = storedKeys.pop();
      warn("Cache is full, removing item with key '" + key + "'");
      removeItem(storedKey.key);
      removeItem(expirationKey(storedKey.key));
      targetSize -= storedKey.size;
      }
      try {
      setItem(key, value);
      } catch (e) {
      // value may be larger than total quota
      warn("Could not add item with key '" + key + "', perhaps it's too big?", e);
      return;
      }
    } else {
      // If it was some other error, just give up.
      warn("Could not add item with key '" + key + "'", e);
      return;
    }
    }

    // If a time is specified, store expiration info in localStorage
    if (time) {
    setItem(expirationKey(key), (currentTime() + time).toString(EXPIRY_RADIX));
    } else {
    // In case they previously set a time, remove that info from localStorage.
    removeItem(expirationKey(key));
    }
  },

  /**
   * Checks whether a given key is expired
   * @param {string} key
   * @return {Boolean}
   */
  isExpired: function(key) {
    if (!supportsStorage()) return null;

    var exprKey = expirationKey(key);
    var expr = getItem(exprKey);

    if (expr) {
    var expirationTime = parseInt(expr, EXPIRY_RADIX);

    // Check if we should actually kick item out of storage
    if (currentTime() >= expirationTime) {
      return true;
    }
    }

    return false;
  },


  /**
   * Sets the muber of milliseconds per 'unit' of cache time.  For example,
   * to cache by minutes, the default, this would be (60 * 1000).  To
   * cache by seconds, this would be 1000.
   *
   * Note, this flushes the lscache as well if the units differ from what
   * was previously used, to ensure that no prior data, using a different
   * unit, remains in an invalid cache state

   * @param {number} ms
   */
  setExpiryUnitMs: function (ms) {
    var existingUnits = lscache.get(EXPIRY_UNITS_KEY);
    lscache.set(EXPIRY_UNITS_KEY, ms);

    // Only clear if the new units dont match the old
    if (existingUnits !== ms) {
    lscache.flush();
    }
    EXPIRY_UNITS = ms;
  },

  /**
   * Retrieves specified value from localStorage, if not expired.
   * @param {string} key
   * @param {boolean} skipRemove Don't remove the item if expired [Default: false]
   * @param {boolean} allowExpr  Allow returning of expired values  [Default: false]
   * @return {string|Object}
   */
  get: function(key, skipRemove, allowExpired) {
    if (!supportsStorage()) return null;

    var value;

    skipRemove = (skipRemove === true);  // Default false
    allowExpired = (allowExpired === true); // Default false

    if (lscache.isExpired(key)) {
    if (!skipRemove) {
      var exprKey = expirationKey(key);
      value = getItem(key);  // Cache in case allowExpired is also true!
      removeItem(key);
      removeItem(exprKey);
    }
    if (!allowExpired) {
      return null;
    }
    }

    // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
    if (!value) { value = getItem(key); }
    if (!value || !supportsJSON()) {
    return value;
    }

    try {
    // We can't tell if its JSON or a string, so we try to parse
    return JSON.parse(value);
    } catch (e) {
    // If we can't parse, it's probably because it isn't an object
    return value;
    }
  },

  /**
   * Removes a value from localStorage.
   * Equivalent to 'delete' in memcache, but that's a keyword in JS.
   * @param {string} key
   */
  remove: function(key) {
    if (!supportsStorage()) return null;
    removeItem(key);
    removeItem(expirationKey(key));
  },

  /**
   * Returns whether local storage is supported.
   * Currently exposed for testing purposes.
   * @return {boolean}
   */
  supported: function() {
    return supportsStorage();
  },

  /**
   * Flushes all lscache items and expiry markers without affecting rest of localStorage
   */
  flush: function() {
    if (!supportsStorage()) return;

    // Loop in reverse as removing items will change indices of tail
    for (var i = localStorage.length-1; i >= 0 ; --i) {
    var key = localStorage.key(i);
    if (key.indexOf(CACHE_PREFIX + cacheBucket) === 0) {
      localStorage.removeItem(key);
    }
    }
  },

  /**
   * Appends CACHE_PREFIX so lscache will partition data in to different buckets.
   * @param {string} bucket
   */
  setBucket: function(bucket) {
    cacheBucket = bucket;
  },

  /**
   * Resets the string being appended to CACHE_PREFIX so lscache will use the default storage behavior.
   */
  resetBucket: function() {
    cacheBucket = '';
  },

  /**
   * Sets whether to display warnings when an item is removed from the cache or not.
   */
  enableWarnings: function(enabled) {
    warnings = enabled;
  }
  };

  // Set initial expiry units
  lscache.set(EXPIRY_UNITS_KEY, EXPIRY_UNITS);

  // Return the module
  return lscache;
}));

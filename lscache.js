// Apache 2.0 license

var lscache = function() {
  var CACHESUFFIX = '-cacheexpiration';

  function supportsStorage() {
    return ('localStorage' in window) && window['localStorage'] !== null;
  }

  function supportsJSON() {
    return ('JSON' in window) && window['JSON'] !== null;
  }

  function expirationKey(key) {
    return key + CACHESUFFIX;
  }

  function currentTime() {
    // Get number of minutes since epoch
    return Math.floor((new Date().getTime())/60000);
  }

  return {

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
      if (typeof value != 'string') {
        if (!supportsJSON()) return;
        try {
          value = JSON.stringify(value);
        } catch (e) {
          // Sometimes we can't stringify due to circular refs
          // in complex objects, so we won't bother storing then.
          return;
        }
      }

      // Use this function to loop until the value "fits" into available space.
      function setItem(key, value) {
        try {
          return localStorage.setItem(key, value);
        } catch (e) {
          if (e.name === 'QUOTA_EXCEEDED_ERR') {
            // If the quota is exceeded, but the localStorage is empty, we can't store the item.
            if(localStorage.length <= 0) {
              return null;
            }
            // If we exceeded the quota, then we will sort
            // by the expire time, and then remove the N oldest
            var storedKeys = [];
            for (var i = 0; i < localStorage.length; i++) {
              var storedKey = localStorage.key(i);
              if (storedKey.indexOf(CACHESUFFIX) > -1) {
                var mainKey = storedKey.split(CACHESUFFIX)[0];
                storedKeys.push({key: mainKey, expiration: parseInt(localStorage[storedKey])});
              }
            }
            storedKeys.sort(function(a, b) { return (a.expiration-b.expiration); });

            for (var i = 0, len = Math.min(30, storedKeys.length); i < len; i++) {
              localStorage.removeItem(storedKeys[i].key);
              localStorage.removeItem(expirationKey(storedKeys[i].key));
            }
            return setItem(key, value);
          } else {
            // If it was some other error, just give up.
            return null;
          }
        }
      }

      setItem(key, value);

      if (time) {
        localStorage.setItem(expirationKey(key), (currentTime() + time));
      } else {
        // In case they set a time earlier, remove it.
        localStorage.removeItem(expirationKey(key));
      }
    },

    /**
     * Retrieves specified value from localStorage, if not expired.
     * @param {string} key
     * @return {string|Object}
     */
    get: function(key) {
      if (!supportsStorage()) return null;

      function parsedStorage(key) {
         if (supportsJSON()) {
           try {
             // We can't tell if its JSON or a string, so we try to parse
             return JSON.parse(localStorage.getItem(key));
           } catch(e) {
             // If we can't parse, it's probably because it isn't an object
             return localStorage.getItem(key);
           }
         } else {
           return localStorage.getItem(key);
         }
      }

      if (localStorage.getItem(expirationKey(key))) {
        var expirationTime = parseInt(localStorage.getItem(expirationKey(key)));
        if (currentTime() > expirationTime) {
          localStorage.removeItem(key);
          localStorage.removeItem(expirationKey(key));
          return null;
        } else {
          return parsedStorage(key);
        }
      } else if (localStorage.getItem(key)) {
        return parsedStorage(key);
      }
      return null;
    },

    /**
     * Removes a value from localStorage.
     * Equivalent to 'delete' in memcache, but that's a keyword in JS.
     * @param {string} key
     */
    remove: function(key) {
      if (!supportsStorage()) return null;
      localStorage.removeItem(key);
      localStorage.removeItem(expirationKey(key));
    }
  }
}();

/**
 * lscache library
 * Copyright (c) 2011, Pamela Fox
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

/**
 * Creates a namespace for the lscache functions.
 */
var lscache = function() {
  // Suffixes the key name on the expiration items in localStorage 
  // shortened to help save space
  var CACHESUFFIX = '-EXP',
      TOUCHEDSUFFIX = '-LRU';

  // Determines if localStorage is supported in the browser;
  // result is cached for better performance instead of being run each time.
  // Feature detection is based on how Modernizr does it;
  // it's not straightforward due to FF4 issues.
  var supportsStorage = function () {
    try {
      return !!localStorage.getItem;
    } catch (e) {
      return false;
    }
  }();

  // Determines if native JSON (de-)serialization is supported in the browser.
  var supportsJSON = (window.JSON != null);

  /**
   * Returns the full string for the localStorage expiration item.
   * @param {String} key
   * @return {string}
   */
  function expirationKey(key) {
    return key + CACHESUFFIX;
  }
  
  /**
   * Returns the full string for the localStorage last access item
   * @param {String} key
   * @return {string}
   */
  function touchedKey(key) {
    return key + TOUCHEDSUFFIX;
  }

  /**
   * Returns the number of minutes since the epoch.
   * @return {number}
   */
  function currentTime() {
    return Math.floor((new Date().getTime())/60000);
  }
  
  function attemptStorage(key, value, time) {
    var purgeSize = 1,
        sorted = false,
        firstTry = true,
        storedKeys = [],
        storedKey,
        removeItem;
    
    // start the retry loop until we can store
    retryLoop();
    
    function retryLoop() {
      try {
        // store into the touchedKey first. This way, if we overflow, we always
        // have the smallest units for reduction
        localStorage.setItem(touchedKey(key), currentTime());
        
        if (time > 0) {
          // if time is set, then add an expires key
          localStorage.setItem(expirationKey(key), currentTime() + time);
          localStorage.setItem(key, value);
        }
        else if (time < 0 || time === 0) {
          // if time is in the past or explictly 0, it's auto-expired
          // remove the key and return
          localStorage.removeItem(touchedKey(key));
          localStorage.removeItem(expirationKey(key));
          localStorage.removeItem(key);
          return;
        }
        else {
          // no time is set, it was a "forever" setting
          localStorage.setItem(key, value);
        }
      }
      catch(e) {
        if (e.name === 'QUOTA_EXCEEDED_ERR' || e.name == 'NS_ERROR_DOM_QUOTA_REACHED') {
          // if we fail and there's nothing in localstorage, then
          // there is simply too much trying to be stored
          if (storedKeys.length === 0 && !firstTry) {
            throw new Error("Object with size of "+(key.length + value.length)+" is too large for localStorage");
          }
          
          // there is logic that happens only on the first failure through
          if (firstTry) {
            firstTry = false;
          }
          
          // If we exceeded the quota, then we will sort
          // by the expire time, and then remove the N oldest
          if (!sorted) {
            for (var i = 0, len = localStorage.length; i < len; i++) {
              storedKey = localStorage.key(i);
              if (storedKey.indexOf(TOUCHEDSUFFIX) > -1) {
                var mainKey = storedKey.split(TOUCHEDSUFFIX)[0];
                storedKeys.push({key: mainKey, touched: parseInt(localStorage[storedKey], 10)});
              }
            }
            storedKeys.sort(function(a, b) { return (a.touched-b.touched); });
          }
          
          // LRU
          removeItem = storedKeys.shift();
          if (removeItem) {
            localStorage.removeItem(touchedKey(removeItem.key));
            localStorage.removeItem(expirationKey(removeItem.key));
            localStorage.removeItem(removeItem.key);
          }
          
          // try again (currently recursive)
          retryLoop();
        }
        else {
          // this was some other error. Give up
          return;
        }
      }
    }
  }

  return {

    /**
     * Stores the value in localStorage. Expires after specified number of minutes.
     * @param {string} key
     * @param {Object|string} value
     * @param {number} time
     */
    set: function(key, value, time) {
      if (!supportsStorage) return;

      // If we don't get a string value, try to stringify
      // In future, localStorage may properly support storing non-strings
      // and this can be removed.
      if (typeof value != 'string') {
        if (!supportsJSON) return;
        try {
          value = JSON.stringify(value);
        } catch (e) {
          // Sometimes we can't stringify due to circular refs
          // in complex objects, so we won't bother storing then.
          return;
        }
      }

      attemptStorage(key, value, time);
    },

    /**
     * Retrieves specified value from localStorage, if not expired.
     * @param {string} key
     * @return {string|Object}
     */
    get: function(key) {
      if (!supportsStorage) return null;

      /**
       * Tries to de-serialize stored value if its an object, and returns the
       * normal value otherwise.
       * @param {String} key
       */
      function parsedStorage(key) {
         if (supportsJSON) {
           try {
             // We can't tell if its JSON or a string, so we try to parse
             var value = JSON.parse(localStorage.getItem(key));
             return value;
           } catch(e) {
             // If we can't parse, it's probably because it isn't an object
             return localStorage.getItem(key);
           }
         } else {
           return localStorage.getItem(key);
         }
      }

      // Return the de-serialized item if not expired
      if (localStorage.getItem(expirationKey(key))) {
        var expirationTime = parseInt(localStorage.getItem(expirationKey(key)), 10);
        // Check if we should actually kick item out of storage
        if (currentTime() >= expirationTime) {
          localStorage.removeItem(key);
          localStorage.removeItem(expirationKey(key));
          localStorage.removeItem(touchedKey(key));
          return null;
        } else {
          localStorage.setItem(touchedKey(key), currentTime());
          return parsedStorage(key);
        }
      } else if (localStorage.getItem(key)) {
        localStorage.setItem(touchedKey(key), currentTime());
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
      if (!supportsStorage) return null;
      localStorage.removeItem(key);
      localStorage.removeItem(expirationKey(key));
      localStorage.removeItem(touchedKey(key));
    }
  };
}();

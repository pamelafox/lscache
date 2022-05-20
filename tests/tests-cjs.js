(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

/* jshint undef:true, browser:true, node:true */
/* global define */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof module !== "undefined" && module.exports) {
        // CommonJS/Node module
        module.exports = factory();
    } else {
        // Browser globals
        root.lscache = factory();
    }
}(this, function () {

  // Prefix for all lscache keys
  var CACHE_PREFIX = 'lscache-';

  // Suffix for the key name on the expiration items in localStorage
  var CACHE_SUFFIX = '-cacheexpiration';

  // expiration date radix (set to Base-36 for most space savings)
  var EXPIRY_RADIX = 10;

  // time resolution in milliseconds
  var expiryMilliseconds = 60 * 1000;
  // ECMAScript max Date (epoch + 1e8 days)
  var maxDate = calculateMaxDate(expiryMilliseconds);

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

    // some browsers will throw an error if you try to access local storage (e.g. brave browser)
    // hence check is inside a try/catch
    try {
      if (!localStorage) {
        return false;
      }
    } catch (ex) {
      return false;
    }

    try {
      setItem(key, value);
      removeItem(key);
      cachedStorage = true;
    } catch (e) {
        // If we hit the limit, and we don't have an empty localStorage then it means we have support
        if (isOutOfSpace(e) && localStorage.length) {
            cachedStorage = true; // just maxed it out and even the set test failed.
        } else {
            cachedStorage = false;
        }
    }
    return cachedStorage;
  }

  // Check to set if the error is us dealing with being out of space
  function isOutOfSpace(e) {
    return e && (
      e.name === 'QUOTA_EXCEEDED_ERR' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.name === 'QuotaExceededError'
    );
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
   * Returns a string where all RegExp special characters are escaped with a \.
   * @param {String} text
   * @return {string}
   */
  function escapeRegExpSpecialCharacters(text) {
    return text.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
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
    return Math.floor((new Date().getTime())/expiryMilliseconds);
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

  function eachKey(fn) {
    var prefixRegExp = new RegExp('^' + CACHE_PREFIX + escapeRegExpSpecialCharacters(cacheBucket) + '(.*)');
    // We first identify which keys to process
    var keysToProcess = [];
    var key, i;
    for (i = 0; i < localStorage.length; i++) {
      key = localStorage.key(i);
      key = key && key.match(prefixRegExp);
      key = key && key[1];
      if (key && key.indexOf(CACHE_SUFFIX) < 0) {
        keysToProcess.push(key);
      }
    }
    // Then we apply the processing function to each key
    for (i = 0; i < keysToProcess.length; i++) {
      fn(keysToProcess[i], expirationKey(keysToProcess[i]));
    }
  }

  function flushItem(key) {
    var exprKey = expirationKey(key);

    removeItem(key);
    removeItem(exprKey);
  }

  function flushExpiredItem(key) {
    var exprKey = expirationKey(key);
    var expr = getItem(exprKey);

    if (expr) {
      var expirationTime = parseInt(expr, EXPIRY_RADIX);

      // Check if we should actually kick item out of storage
      if (currentTime() >= expirationTime) {
        removeItem(key);
        removeItem(exprKey);
        return true;
      }
    }
  }

  function warn(message, err) {
    if (!warnings) return;
    if (!('console' in window) || typeof window.console.warn !== 'function') return;
    window.console.warn("lscache - " + message);
    if (err) window.console.warn("lscache - The error was: " + err.message);
  }

  function calculateMaxDate(expiryMilliseconds) {
    return Math.floor(8.64e15/expiryMilliseconds);
  }

  var lscache = {
    /**
     * Stores the value in localStorage. Expires after specified number of minutes.
     * @param {string} key
     * @param {Object|string} value
     * @param {number} time
     * @return {boolean} whether the value was inserted successfully
     */
    set: function(key, value, time) {
      if (!supportsStorage()) return false;

      // If we don't get a string value, try to stringify
      // In future, localStorage may properly support storing non-strings
      // and this can be removed.

      if (!supportsJSON()) return false;
      try {
        value = JSON.stringify(value);
      } catch (e) {
        // Sometimes we can't stringify due to circular refs
        // in complex objects, so we won't bother storing then.
        return false;
      }

      try {
        setItem(key, value);
      } catch (e) {
        if (isOutOfSpace(e)) {
          // If we exceeded the quota, then we will sort
          // by the expire time, and then remove the N oldest
          var storedKeys = [];
          var storedKey;
          eachKey(function(key, exprKey) {
            var expiration = getItem(exprKey);
            if (expiration) {
              expiration = parseInt(expiration, EXPIRY_RADIX);
            } else {
              // TODO: Store date added for non-expiring items for smarter removal
              expiration = maxDate;
            }
            storedKeys.push({
              key: key,
              size: (getItem(key) || '').length,
              expiration: expiration
            });
          });
          // Sorts the keys with oldest expiration time last
          storedKeys.sort(function(a, b) { return (b.expiration-a.expiration); });

          var targetSize = (value||'').length;
          while (storedKeys.length && targetSize > 0) {
            storedKey = storedKeys.pop();
            warn("Cache is full, removing item with key '" + storedKey.key + "'");
            flushItem(storedKey.key);
            targetSize -= storedKey.size;
          }
          try {
            setItem(key, value);
          } catch (e) {
            // value may be larger than total quota
            warn("Could not add item with key '" + key + "', perhaps it's too big?", e);
            return false;
          }
        } else {
          // If it was some other error, just give up.
          warn("Could not add item with key '" + key + "'", e);
          return false;
        }
      }

      // If a time is specified, store expiration info in localStorage
      if (time) {
        setItem(expirationKey(key), (currentTime() + time).toString(EXPIRY_RADIX));
      } else {
        // In case they previously set a time, remove that info from localStorage.
        removeItem(expirationKey(key));
      }
      return true;
    },

    /**
     * Retrieves specified value from localStorage, if not expired.
     * @param {string} key
     * @return {string|Object}
     */
    get: function(key) {
      if (!supportsStorage()) return null;

      // Return the de-serialized item if not expired
      if (flushExpiredItem(key)) { return null; }

      // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
      var value = getItem(key);
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
      if (!supportsStorage()) return;

      flushItem(key);
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

      eachKey(function(key) {
        flushItem(key);
      });
    },

    /**
     * Flushes expired lscache items and expiry markers without affecting rest of localStorage
     */
    flushExpired: function() {
      if (!supportsStorage()) return;

      eachKey(function(key) {
        flushExpiredItem(key);
      });
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
     * @returns {number} The currently set number of milliseconds each time unit represents in
     *   the set() function's "time" argument.
     */
    getExpiryMilliseconds: function() {
      return expiryMilliseconds;
    },

    /**
     * Sets the number of milliseconds each time unit represents in the set() function's
     *   "time" argument.
     * Sample values:
     *  1: each time unit = 1 millisecond
     *  1000: each time unit = 1 second
     *  60000: each time unit = 1 minute (Default value)
     *  360000: each time unit = 1 hour
     * @param {number} milliseconds
     */
    setExpiryMilliseconds: function(milliseconds) {
        expiryMilliseconds = milliseconds;
        maxDate = calculateMaxDate(expiryMilliseconds);
    },

    /**
     * Sets whether to display warnings when an item is removed from the cache or not.
     */
    enableWarnings: function(enabled) {
      warnings = enabled;
    }
  };

  // Return the module
  return lscache;
}));

},{}],2:[function(require,module,exports){
(function (global){(function (){
; var __browserify_shim_require__=require;(function browserifyShim(module, exports, require, define, browserify_shim__define__module__export__) {
!function(a){function r(){var a,b;c.autorun=!0,c.previousModule&&D("moduleDone",{name:c.previousModule.name,tests:c.previousModule.tests,failed:c.moduleStats.bad,passed:c.moduleStats.all-c.moduleStats.bad,total:c.moduleStats.all,runtime:j()-c.moduleStats.started}),delete c.previousModule,a=j()-c.started,b=c.stats.all-c.stats.bad,D("done",{failed:c.stats.bad,passed:b,total:c.stats.all,runtime:a})}function s(a,b){b=void 0===b?4:b;var c,d,e;if(a.stack){if(c=a.stack.split("\n"),/^error$/i.test(c[0])&&c.shift(),f){for(d=[],e=b;e<c.length&&c[e].indexOf(f)===-1;e++)d.push(c[e]);if(d.length)return d.join("\n")}return c[b]}if(a.sourceURL){if(/qunit.js$/.test(a.sourceURL))return;return a.sourceURL+":"+a.line}}function t(a){var b=new Error;if(!b.stack)try{throw b}catch(a){b=a}return s(b,a)}function u(a,d){if("array"!==b.objectType(a))c.queue.push(a),c.autorun&&!c.blocking&&v(d);else for(;a.length;)u(a.shift())}function v(a){function b(){v(a)}var d=j();for(c.depth=(c.depth||0)+1;c.queue.length&&!c.blocking;){if(!(!o.setTimeout||c.updateRate<=0||j()-d<c.updateRate)){m(b,13);break}c.current&&(c.current.usedAsync=!1),c.queue.shift()()}c.depth--,!a||c.blocking||c.queue.length||0!==c.depth||r()}function w(){var a,b,d=[];if(!c.started){for(c.started=j(),E(),""===c.modules[0].name&&0===c.modules[0].tests.length&&c.modules.shift(),a=0,b=c.modules.length;a<b;a++)d.push({name:c.modules[a].name,tests:c.modules[a].tests});D("begin",{totalTests:G.count,modules:d})}c.blocking=!1,v(!0)}function x(){l=!0,o.setTimeout?m(function(){c.current&&c.current.semaphore>0||(c.timeout&&n(c.timeout),w())},13):w()}function y(){c.blocking=!0,c.testTimeout&&o.setTimeout&&(n(c.timeout),c.timeout=m(function(){if(!c.current)throw new Error("Test timed out");c.current.semaphore=0,b.pushFailure("Test timed out",t(2)),x()},c.testTimeout))}function z(){if(c.pollution=[],c.noglobals)for(var b in a)if(h.call(a,b)){if(/^qunit-test-output/.test(b))continue;c.pollution.push(b)}}function A(){var a,d,e=c.pollution;z(),a=B(c.pollution,e),a.length>0&&b.pushFailure("Introduced global variable(s): "+a.join(", ")),d=B(e,c.pollution),d.length>0&&b.pushFailure("Deleted global variable(s): "+d.join(", "))}function B(a,b){var c,d,e=a.slice();for(c=0;c<e.length;c++)for(d=0;d<b.length;d++)if(e[c]===b[d]){e.splice(c,1),c--;break}return e}function C(b,c,d){for(var e in c)h.call(c,e)&&("constructor"===e&&b===a||(void 0===c[e]?delete b[e]:d&&"undefined"!=typeof b[e]||(b[e]=c[e])));return b}function D(a,b){var d,e,f;for(f=c.callbacks[a],d=0,e=f.length;d<e;d++)f[d](b)}function E(){var c,d;for(c in e)b[c]!==e[c]&&(d=b[c],b[c]=e[c],b[c](d),a.console&&a.console.warn&&a.console.warn("QUnit."+c+" was replaced with a new value.\nPlease, check out the documentation on how to apply logging callbacks.\nReference: http://api.qunitjs.com/category/callbacks/"))}function F(a,b){if(b.indexOf)return b.indexOf(a);for(var c=0,d=b.length;c<d;c++)if(b[c]===a)return c;return-1}function G(a){var b,d;for(++G.count,C(this,a),this.assertions=[],this.semaphore=0,this.usedAsync=!1,this.module=c.currentModule,this.stack=t(3),b=0,d=this.module.tests;b<d.length;b++)this.module.tests[b].name===this.testName&&(this.testName+=" ");this.testId=H(this.module.name,this.testName),this.module.tests.push({name:this.testName,testId:this.testId}),a.skip?(this.callback=function(){},this.async=!1,this.expected=0):this.assert=new I(this)}function H(a,b){for(var c,d=0,e=0,f=a+""+b,g=f.length;d<g;d++)e=(e<<5)-e+f.charCodeAt(d),e|=0;return c=(4294967296+e).toString(16),c.length<8&&(c="0000000"+c),c.slice(-8)}function I(a){this.test=a}var b,c,d,e={},f=(t(0)||"").replace(/(:\d+)+\)?/,"").replace(/.+\//,""),g=Object.prototype.toString,h=Object.prototype.hasOwnProperty,i=a.Date,j=i.now||function(){return(new i).getTime()},k=!1,l=!1,m=a.setTimeout,n=a.clearTimeout,o={document:void 0!==a.document,setTimeout:void 0!==a.setTimeout,sessionStorage:function(){var a="qunit-test-string";try{return sessionStorage.setItem(a,a),sessionStorage.removeItem(a),!0}catch(a){return!1}}()},p=function(a){var b,c,d=a.toString();return"[object"===d.substring(0,7)?(b=a.name?a.name.toString():"Error",c=a.message?a.message.toString():"",b&&c?b+": "+c:b?b:c?c:"Error"):d},q=function(a){var c,d,e=b.is("array",a)?[]:{};for(c in a)h.call(a,c)&&(d=a[c],e[c]=d===Object(d)?q(d):d);return e};b={},c={queue:[],blocking:!0,reorder:!0,altertitle:!0,scrolltop:!0,requireExpects:!1,maxDepth:5,urlConfig:[{id:"hidepassed",label:"Hide passed tests",tooltip:"Only show tests and assertions that fail. Stored as query-strings."},{id:"noglobals",label:"Check for Globals",tooltip:"Enabling this will test if any test introduces new properties on the `window` object. Stored as query-strings."},{id:"notrycatch",label:"No try-catch",tooltip:"Enabling this will run tests outside of a try-catch block. Makes debugging exceptions in IE reasonable. Stored as query-strings."}],modules:[],currentModule:{name:"",tests:[]},callbacks:{}},c.modules.push(c.currentModule),function(){var d,e,f=a.location||{search:"",protocol:"file:"},g=f.search.slice(1).split("&"),h=g.length,i={};if(g[0])for(d=0;d<h;d++)e=g[d].split("="),e[0]=decodeURIComponent(e[0]),e[1]=!e[1]||decodeURIComponent(e[1]),i[e[0]]?i[e[0]]=[].concat(i[e[0]],e[1]):i[e[0]]=e[1];if(i.filter===!0&&delete i.filter,b.urlParams=i,c.filter=i.filter,i.maxDepth&&(c.maxDepth=parseInt(i.maxDepth,10)===-1?Number.POSITIVE_INFINITY:i.maxDepth),c.testId=[],i.testId)for(i.testId=decodeURIComponent(i.testId).split(","),d=0;d<i.testId.length;d++)c.testId.push(i.testId[d]);b.isLocal="file:"===f.protocol,b.version="1.18.0"}(),C(b,{module:function(a,b){var d={name:a,testEnvironment:b,tests:[]};b&&b.setup&&(b.beforeEach=b.setup,delete b.setup),b&&b.teardown&&(b.afterEach=b.teardown,delete b.teardown),c.modules.push(d),c.currentModule=d},asyncTest:function(a,c,d){2===arguments.length&&(d=c,c=null),b.test(a,c,d,!0)},test:function(a,b,c,d){var e;2===arguments.length&&(c=b,b=null),e=new G({testName:a,expected:b,async:d,callback:c}),e.queue()},skip:function(a){var b=new G({testName:a,skip:!0});b.queue()},start:function(a){var d=k;if(c.current){if(c.current.semaphore-=a||1,c.current.semaphore>0)return;if(c.current.semaphore<0)return c.current.semaphore=0,void b.pushFailure("Called start() while already started (test's semaphore was 0 already)",t(2))}else{if(k=!0,l)throw new Error("Called start() outside of a test context while already started");if(d||a>1)throw new Error("Called start() outside of a test context too many times");if(c.autostart)throw new Error("Called start() outside of a test context when QUnit.config.autostart was true");if(!c.pageLoaded)return void(c.autostart=!0)}x()},stop:function(a){if(!c.current)throw new Error("Called stop() outside of a test context");c.current.semaphore+=a||1,y()},config:c,is:function(a,c){return b.objectType(c)===a},objectType:function(a){if("undefined"==typeof a)return"undefined";if(null===a)return"null";var b=g.call(a).match(/^\[object\s(.*)\]$/),c=b&&b[1]||"";switch(c){case"Number":return isNaN(a)?"nan":"number";case"String":case"Boolean":case"Array":case"Date":case"RegExp":case"Function":return c.toLowerCase()}return"object"==typeof a?"object":void 0},extend:C,load:function(){c.pageLoaded=!0,C(c,{stats:{all:0,bad:0},moduleStats:{all:0,bad:0},started:0,updateRate:1e3,autostart:!0,filter:""},!0),c.blocking=!1,c.autostart&&x()}}),function(){function h(a){var d=function(d){if("function"!==b.objectType(d))throw new Error("QUnit logging methods require a callback function as their first parameters.");c.callbacks[a].push(d)};return e[a]=d,d}var a,d,f,g=["begin","done","log","testStart","testDone","moduleStart","moduleDone"];for(a=0,d=g.length;a<d;a++)f=g[a],"undefined"===b.objectType(c.callbacks[f])&&(c.callbacks[f]=[]),b[f]=h(f)}(),d=a.onerror,a.onerror=function(a,c,e){var f=!1;if(d&&(f=d(a,c,e)),f!==!0){if(b.config.current){if(b.config.current.ignoreGlobalErrors)return!0;b.pushFailure(a,c+":"+e)}else b.test("global failure",C(function(){b.pushFailure(a,c+":"+e)},{validTest:!0}));return!1}return f},G.count=0,G.prototype={before:function(){this.module===c.previousModule&&h.call(c,"previousModule")||(h.call(c,"previousModule")&&D("moduleDone",{name:c.previousModule.name,tests:c.previousModule.tests,failed:c.moduleStats.bad,passed:c.moduleStats.all-c.moduleStats.bad,total:c.moduleStats.all,runtime:j()-c.moduleStats.started}),c.previousModule=this.module,c.moduleStats={all:0,bad:0,started:j()},D("moduleStart",{name:this.module.name,tests:this.module.tests})),c.current=this,this.testEnvironment=C({},this.module.testEnvironment),delete this.testEnvironment.beforeEach,delete this.testEnvironment.afterEach,this.started=j(),D("testStart",{name:this.testName,module:this.module.name,testId:this.testId}),c.pollution||z()},run:function(){var a;if(c.current=this,this.async&&b.stop(),this.callbackStarted=j(),c.notrycatch)return a=this.callback.call(this.testEnvironment,this.assert),void this.resolvePromise(a);try{a=this.callback.call(this.testEnvironment,this.assert),this.resolvePromise(a)}catch(a){this.pushFailure("Died on test #"+(this.assertions.length+1)+" "+this.stack+": "+(a.message||a),s(a,0)),z(),c.blocking&&b.start()}},after:function(){A()},queueHook:function(a,b){var d,e=this;return function(){if(c.current=e,c.notrycatch)return d=a.call(e.testEnvironment,e.assert),void e.resolvePromise(d,b);try{d=a.call(e.testEnvironment,e.assert),e.resolvePromise(d,b)}catch(a){e.pushFailure(b+" failed on "+e.testName+": "+(a.message||a),s(a,0))}}},hooks:function(a){var c=[];return this.skip?c:(this.module.testEnvironment&&"function"===b.objectType(this.module.testEnvironment[a])&&c.push(this.queueHook(this.module.testEnvironment[a],a)),c)},finish:function(){c.current=this,c.requireExpects&&null===this.expected?this.pushFailure("Expected number of assertions to be defined, but expect() was not called.",this.stack):null!==this.expected&&this.expected!==this.assertions.length?this.pushFailure("Expected "+this.expected+" assertions, but "+this.assertions.length+" were run",this.stack):null!==this.expected||this.assertions.length||this.pushFailure("Expected at least one assertion, but none were run - call expect(0) to accept zero assertions.",this.stack);var a,d=0;for(this.runtime=j()-this.started,c.stats.all+=this.assertions.length,c.moduleStats.all+=this.assertions.length,a=0;a<this.assertions.length;a++)this.assertions[a].result||(d++,c.stats.bad++,c.moduleStats.bad++);D("testDone",{name:this.testName,module:this.module.name,skipped:!!this.skip,failed:d,passed:this.assertions.length-d,total:this.assertions.length,runtime:this.runtime,assertions:this.assertions,testId:this.testId,duration:this.runtime}),b.reset(),c.current=void 0},queue:function(){function d(){u([function(){c.before()},c.hooks("beforeEach"),function(){c.run()},c.hooks("afterEach").reverse(),function(){c.after()},function(){c.finish()}])}var a,c=this;this.valid()&&(a=b.config.reorder&&o.sessionStorage&&+sessionStorage.getItem("qunit-test-"+this.module.name+"-"+this.testName),a?d():u(d,!0))},push:function(a,b,c,d){var e,f={module:this.module.name,name:this.testName,result:a,message:d,actual:b,expected:c,testId:this.testId,runtime:j()-this.started};a||(e=t(),e&&(f.source=e)),D("log",f),this.assertions.push({result:!!a,message:d})},pushFailure:function(a,b,c){if(!this instanceof G)throw new Error("pushFailure() assertion outside test context, was "+t(2));var d={module:this.module.name,name:this.testName,result:!1,message:a||"error",actual:c||null,testId:this.testId,runtime:j()-this.started};b&&(d.source=b),D("log",d),this.assertions.push({result:!1,message:a})},resolvePromise:function(a,c){var d,e,f=this;null!=a&&(d=a.then,"function"===b.objectType(d)&&(b.stop(),d.call(a,b.start,function(a){e="Promise rejected "+(c?c.replace(/Each$/,""):"during")+" "+f.testName+": "+(a.message||a),f.pushFailure(e,s(a,0)),z(),b.start()})))},valid:function(){var a,d=c.filter&&c.filter.toLowerCase(),e=b.urlParams.module&&b.urlParams.module.toLowerCase(),f=(this.module.name+": "+this.testName).toLowerCase();return!(!this.callback||!this.callback.validTest)||!(c.testId.length>0&&F(this.testId,c.testId)<0)&&(!(e&&(!this.module.name||this.module.name.toLowerCase()!==e))&&(!d||(a="!"!==d.charAt(0),a||(d=d.slice(1)),f.indexOf(d)!==-1?a:!a)))}},b.reset=function(){if("undefined"!=typeof a){var b=o.document&&document.getElementById&&document.getElementById("qunit-fixture");b&&(b.innerHTML=c.fixture)}},b.pushFailure=function(){if(!b.config.current)throw new Error("pushFailure() assertion outside test context, in "+t(2));var a=b.config.current;return a.pushFailure.apply(a,arguments)},b.assert=I.prototype={expect:function(a){return 1!==arguments.length?this.test.expected:void(this.test.expected=a)},async:function(){var a=this.test,b=!1;return a.semaphore+=1,a.usedAsync=!0,y(),function(){b?a.pushFailure("Called the callback returned from `assert.async` more than once",t(2)):(a.semaphore-=1,b=!0,x())}},push:function(){var a=this,c=a instanceof I&&a.test||b.config.current;if(!c)throw new Error("assertion outside test context, in "+t(2));return c.usedAsync===!0&&0===c.semaphore&&c.pushFailure("Assertion after the final `assert.async` was resolved",t(2)),a instanceof I||(a=c.assert),a.test.push.apply(a.test,arguments)},ok:function(a,c){c=c||(a?"okay":"failed, expected argument to be truthy, was: "+b.dump.parse(a)),this.push(!!a,a,!0,c)},notOk:function(a,c){c=c||(a?"failed, expected argument to be falsy, was: "+b.dump.parse(a):"okay"),this.push(!a,a,!1,c)},equal:function(a,b,c){this.push(b==a,a,b,c)},notEqual:function(a,b,c){this.push(b!=a,a,b,c)},propEqual:function(a,c,d){a=q(a),c=q(c),this.push(b.equiv(a,c),a,c,d)},notPropEqual:function(a,c,d){a=q(a),c=q(c),this.push(!b.equiv(a,c),a,c,d)},deepEqual:function(a,c,d){this.push(b.equiv(a,c),a,c,d)},notDeepEqual:function(a,c,d){this.push(!b.equiv(a,c),a,c,d)},strictEqual:function(a,b,c){this.push(b===a,a,b,c)},notStrictEqual:function(a,b,c){this.push(b!==a,a,b,c)},throws:function(a,c,d){var e,f,g=c,h=!1,i=this instanceof I&&this.test||b.config.current;null==d&&"string"==typeof c&&(d=c,c=null),i.ignoreGlobalErrors=!0;try{a.call(i.testEnvironment)}catch(a){e=a}i.ignoreGlobalErrors=!1,e&&(f=b.objectType(c),c?"regexp"===f?h=c.test(p(e)):"string"===f?h=c===p(e):"function"===f&&e instanceof c?h=!0:"object"===f?h=e instanceof c.constructor&&e.name===c.name&&e.message===c.message:"function"===f&&c.call({},e)===!0&&(g=null,h=!0):(h=!0,g=null)),i.assert.push(h,e,g,d)}},function(){I.prototype.raises=I.prototype.throws}(),b.equiv=function(){function a(a,c,d){var e=b.objectType(a);if(e)return"function"===b.objectType(c[e])?c[e].apply(c,d):c[e]}var c,d=[],e=[],f=[],g=Object.getPrototypeOf||function(a){return a.__proto__},h=function(){function a(a,b){return a instanceof b.constructor||b instanceof a.constructor?b==a:b===a}return{string:a,boolean:a,number:a,null:a,undefined:a,nan:function(a){return isNaN(a)},date:function(a,c){return"date"===b.objectType(a)&&c.valueOf()===a.valueOf()},regexp:function(a,c){return"regexp"===b.objectType(a)&&c.source===a.source&&c.global===a.global&&c.ignoreCase===a.ignoreCase&&c.multiline===a.multiline&&c.sticky===a.sticky},function:function(){var a=d[d.length-1];return a!==Object&&"undefined"!=typeof a},array:function(a,d){var g,h,i,j,k,l;if("array"!==b.objectType(a))return!1;if(i=d.length,i!==a.length)return!1;for(e.push(d),f.push(a),g=0;g<i;g++){for(j=!1,h=0;h<e.length;h++)if(k=e[h]===d[g],l=f[h]===a[g],k||l){if(!(d[g]===a[g]||k&&l))return e.pop(),f.pop(),!1;j=!0}if(!j&&!c(d[g],a[g]))return e.pop(),f.pop(),!1}return e.pop(),f.pop(),!0},object:function(a,b){var h,i,j,k,l,m=!0,n=[],o=[];if(b.constructor!==a.constructor&&!(null===g(b)&&g(a)===Object.prototype||null===g(a)&&g(b)===Object.prototype))return!1;d.push(b.constructor),e.push(b),f.push(a);for(h in b){for(j=!1,i=0;i<e.length;i++)if(k=e[i]===b[h],l=f[i]===a[h],k||l){if(!(b[h]===a[h]||k&&l)){m=!1;break}j=!0}if(n.push(h),!j&&!c(b[h],a[h])){m=!1;break}}e.pop(),f.pop(),d.pop();for(h in a)o.push(h);return m&&c(n.sort(),o.sort())}}}();return c=function(){var d=[].slice.apply(arguments);return d.length<2||function(c,d){return c===d||null!==c&&null!==d&&"undefined"!=typeof c&&"undefined"!=typeof d&&b.objectType(c)===b.objectType(d)&&a(c,h,[d,c])}(d[0],d[1])&&c.apply(this,d.splice(1,d.length-1))}}(),b.dump=function(){function a(a){return'"'+a.toString().replace(/"/g,'\\"')+'"'}function c(a){return a+""}function d(a,b,c){var d=h.separator(),e=h.indent(),f=h.indent(1);return b.join&&(b=b.join(","+d+f)),b?[a,f+b,e+c].join(d):a+c}function e(a,b){var c=a.length,e=new Array(c);if(h.maxDepth&&h.depth>h.maxDepth)return"[object Array]";for(this.up();c--;)e[c]=this.parse(a[c],void 0,b);return this.down(),d("[",e,"]")}var f=/^function (\w+)/,h={parse:function(a,b,c){c=c||[];var d,e,f,g=F(a,c);return g!==-1?"recursion("+(g-c.length)+")":(b=b||this.typeOf(a),e=this.parsers[b],f=typeof e,"function"===f?(c.push(a),d=e.call(this,a,c),c.pop(),d):"string"===f?e:this.parsers.error)},typeOf:function(a){var c;return c=null===a?"null":"undefined"==typeof a?"undefined":b.is("regexp",a)?"regexp":b.is("date",a)?"date":b.is("function",a)?"function":void 0!==a.setInterval&&void 0!==a.document&&void 0===a.nodeType?"window":9===a.nodeType?"document":a.nodeType?"node":"[object Array]"===g.call(a)||"number"==typeof a.length&&void 0!==a.item&&(a.length?a.item(0)===a[0]:null===a.item(0)&&void 0===a[0])?"array":a.constructor===Error.prototype.constructor?"error":typeof a},separator:function(){return this.multiline?this.HTML?"<br />":"\n":this.HTML?"&#160;":" "},indent:function(a){if(!this.multiline)return"";var b=this.indentChar;return this.HTML&&(b=b.replace(/\t/g,"   ").replace(/ /g,"&#160;")),new Array(this.depth+(a||0)).join(b)},up:function(a){this.depth+=a||1},down:function(a){this.depth-=a||1},setParser:function(a,b){this.parsers[a]=b},quote:a,literal:c,join:d,depth:1,maxDepth:b.config.maxDepth,parsers:{window:"[Window]",document:"[Document]",error:function(a){return'Error("'+a.message+'")'},unknown:"[Unknown]",null:"null",undefined:"undefined",function:function(a){var b="function",c="name"in a?a.name:(f.exec(a)||[])[1];return c&&(b+=" "+c),b+="( ",b=[b,h.parse(a,"functionArgs"),"){"].join(""),d(b,h.parse(a,"functionCode"),"}")},array:e,nodelist:e,arguments:e,object:function(a,b){var c,e,f,g,i,j=[];if(h.maxDepth&&h.depth>h.maxDepth)return"[object Object]";h.up(),c=[];for(e in a)c.push(e);i=["message","name"];for(g in i)e=i[g],e in a&&F(e,c)<0&&c.push(e);for(c.sort(),g=0;g<c.length;g++)e=c[g],f=a[e],j.push(h.parse(e,"key")+": "+h.parse(f,void 0,b));return h.down(),d("{",j,"}")},node:function(a){var b,c,d,e=h.HTML?"&lt;":"<",f=h.HTML?"&gt;":">",g=a.nodeName.toLowerCase(),i=e+g,j=a.attributes;if(j)for(c=0,b=j.length;c<b;c++)d=j[c].nodeValue,d&&"inherit"!==d&&(i+=" "+j[c].nodeName+"="+h.parse(d,"attribute"));return i+=f,3!==a.nodeType&&4!==a.nodeType||(i+=a.nodeValue),i+e+"/"+g+f},functionArgs:function(a){var b,c=a.length;if(!c)return"";for(b=new Array(c);c--;)b[c]=String.fromCharCode(97+c);return" "+b.join(", ")+" "},key:a,functionCode:"[code]",attribute:a,string:a,date:a,regexp:c,number:c,boolean:c},HTML:!1,indentChar:"  ",multiline:!0};return h}(),b.jsDump=b.dump,"undefined"!=typeof a&&(!function(){function d(a){return function(){var c=new I(b.config.current);a.apply(c,arguments)}}var a,c=I.prototype;for(a in c)b[a]=d(c[a])}(),function(){var c,d,e=["test","module","expect","asyncTest","start","stop","ok","notOk","equal","notEqual","propEqual","notPropEqual","deepEqual","notDeepEqual","strictEqual","notStrictEqual","throws"];for(c=0,d=e.length;c<d;c++)a[e[c]]=b[e[c]]}(),a.QUnit=b),"undefined"!=typeof module&&module&&module.exports&&(module.exports=b,module.exports.QUnit=b),"undefined"!=typeof exports&&exports&&(exports.QUnit=b),"function"==typeof define&&define.amd&&(define(function(){return b}),b.config.autostart=!1)}(function(){return this}()),QUnit.diff=function(){function a(){this.DiffTimeout=1,this.DiffEditCost=4}var b=-1,c=1,d=0;return a.prototype.DiffMain=function(a,b,c,e){var f,g,h,i,j,k;if("undefined"==typeof e&&(e=this.DiffTimeout<=0?Number.MAX_VALUE:(new Date).getTime()+1e3*this.DiffTimeout),f=e,null===a||null===b)throw new Error("Null input. (DiffMain)");return a===b?a?[[d,a]]:[]:("undefined"==typeof c&&(c=!0),g=c,h=this.diffCommonPrefix(a,b),i=a.substring(0,h),a=a.substring(h),b=b.substring(h),h=this.diffCommonSuffix(a,b),j=a.substring(a.length-h),a=a.substring(0,a.length-h),b=b.substring(0,b.length-h),k=this.diffCompute(a,b,g,f),i&&k.unshift([d,i]),j&&k.push([d,j]),this.diffCleanupMerge(k),k)},a.prototype.diffCleanupEfficiency=function(a){var e,f,g,h,i,j,k,l,m;for(e=!1,f=[],g=0,h=null,i=0,j=!1,k=!1,l=!1,m=!1;i<a.length;)a[i][0]===d?(a[i][1].length<this.DiffEditCost&&(l||m)?(f[g++]=i,j=l,k=m,h=a[i][1]):(g=0,h=null),l=m=!1):(a[i][0]===b?m=!0:l=!0,h&&(j&&k&&l&&m||h.length<this.DiffEditCost/2&&j+k+l+m===3)&&(a.splice(f[g-1],0,[b,h]),a[f[g-1]+1][0]=c,g--,h=null,j&&k?(l=m=!0,g=0):(g--,i=g>0?f[g-1]:-1,l=m=!1),e=!0)),i++;e&&this.diffCleanupMerge(a)},a.prototype.diffPrettyHtml=function(a){var e,f,g,h=[];for(g=0;g<a.length;g++)switch(e=a[g][0],f=a[g][1],e){case c:h[g]="<ins>"+f+"</ins>";break;case b:h[g]="<del>"+f+"</del>";break;case d:h[g]="<span>"+f+"</span>"}return h.join("")},a.prototype.diffCommonPrefix=function(a,b){var c,d,e,f;if(!a||!b||a.charAt(0)!==b.charAt(0))return 0;for(e=0,d=Math.min(a.length,b.length),c=d,f=0;e<c;)a.substring(f,c)===b.substring(f,c)?(e=c,f=e):d=c,c=Math.floor((d-e)/2+e);return c},a.prototype.diffCommonSuffix=function(a,b){var c,d,e,f;if(!a||!b||a.charAt(a.length-1)!==b.charAt(b.length-1))return 0;for(e=0,d=Math.min(a.length,b.length),c=d,f=0;e<c;)a.substring(a.length-c,a.length-f)===b.substring(b.length-c,b.length-f)?(e=c,f=e):d=c,c=Math.floor((d-e)/2+e);return c},a.prototype.diffCompute=function(a,e,f,g){var h,i,j,k,l,m,n,o,p,q,r,s;return a?e?(i=a.length>e.length?a:e,j=a.length>e.length?e:a,k=i.indexOf(j),k!==-1?(h=[[c,i.substring(0,k)],[d,j],[c,i.substring(k+j.length)]],a.length>e.length&&(h[0][0]=h[2][0]=b),h):1===j.length?[[b,a],[c,e]]:(l=this.diffHalfMatch(a,e),l?(m=l[0],o=l[1],n=l[2],p=l[3],q=l[4],r=this.DiffMain(m,n,f,g),s=this.DiffMain(o,p,f,g),r.concat([[d,q]],s)):f&&a.length>100&&e.length>100?this.diffLineMode(a,e,g):this.diffBisect(a,e,g))):[[b,a]]:[[c,e]]},a.prototype.diffHalfMatch=function(a,b){function n(a,b,c){var d,f,g,h,i,j,k,l,m;for(d=a.substring(c,c+Math.floor(a.length/4)),f=-1,g="";(f=b.indexOf(d,f+1))!==-1;)h=e.diffCommonPrefix(a.substring(c),b.substring(f)),i=e.diffCommonSuffix(a.substring(0,c),b.substring(0,f)),g.length<i+h&&(g=b.substring(f-i,f)+b.substring(f,f+h),j=a.substring(0,c-i),k=a.substring(c+h),l=b.substring(0,f-i),m=b.substring(f+h));return 2*g.length>=a.length?[j,k,l,m,g]:null}var c,d,e,f,g,h,i,j,k,l,m;return this.DiffTimeout<=0?null:(c=a.length>b.length?a:b,d=a.length>b.length?b:a,c.length<4||2*d.length<c.length?null:(e=this,k=n(c,d,Math.ceil(c.length/4)),l=n(c,d,Math.ceil(c.length/2)),k||l?(m=l?k&&k[4].length>l[4].length?k:l:k,a.length>b.length?(f=m[0],i=m[1],h=m[2],g=m[3]):(h=m[0],g=m[1],f=m[2],i=m[3]),j=m[4],[f,i,h,g,j]):null))},a.prototype.diffLineMode=function(a,e,f){var g,h,i,j,k,l,m,n,o;for(g=this.diffLinesToChars(a,e),a=g.chars1,e=g.chars2,i=g.lineArray,h=this.DiffMain(a,e,!1,f),this.diffCharsToLines(h,i),this.diffCleanupSemantic(h),h.push([d,""]),j=0,l=0,k=0,n="",m="";j<h.length;){switch(h[j][0]){case c:k++,m+=h[j][1];break;case b:l++,n+=h[j][1];break;case d:if(l>=1&&k>=1){for(h.splice(j-l-k,l+k),j=j-l-k,g=this.DiffMain(n,m,!1,f),o=g.length-1;o>=0;o--)h.splice(j,0,g[o]);j+=g.length}k=0,l=0,n="",m=""}j++}return h.pop(),h},a.prototype.diffBisect=function(a,d,e){var f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B;for(f=a.length,g=d.length,h=Math.ceil((f+g)/2),i=h,j=2*h,k=new Array(j),l=new Array(j),m=0;m<j;m++)k[m]=-1,l[m]=-1;for(k[i+1]=0,l[i+1]=0,n=f-g,o=n%2!==0,p=0,q=0,r=0,s=0,z=0;z<h&&!((new Date).getTime()>e);z++){for(A=-z+p;A<=z-q;A+=2){for(u=i+A,v=A===-z||A!==z&&k[u-1]<k[u+1]?k[u+1]:k[u-1]+1,x=v-A;v<f&&x<g&&a.charAt(v)===d.charAt(x);)v++,x++;if(k[u]=v,v>f)q+=2;else if(x>g)p+=2;else if(o&&(t=i+n-A,t>=0&&t<j&&l[t]!==-1&&(w=f-l[t],v>=w)))return this.diffBisectSplit(a,d,v,x,e)}for(B=-z+r;B<=z-s;B+=2){for(t=i+B,w=B===-z||B!==z&&l[t-1]<l[t+1]?l[t+1]:l[t-1]+1,y=w-B;w<f&&y<g&&a.charAt(f-w-1)===d.charAt(g-y-1);)w++,y++;if(l[t]=w,w>f)s+=2;else if(y>g)r+=2;else if(!o&&(u=i+n-B,u>=0&&u<j&&k[u]!==-1&&(v=k[u],x=i+v-u,w=f-w,v>=w)))return this.diffBisectSplit(a,d,v,x,e)}}return[[b,a],[c,d]]},a.prototype.diffBisectSplit=function(a,b,c,d,e){var f,g,h,i,j,k;return f=a.substring(0,c),h=b.substring(0,d),g=a.substring(c),i=b.substring(d),j=this.DiffMain(f,h,!1,e),k=this.DiffMain(g,i,!1,e),j.concat(k)},a.prototype.diffCleanupSemantic=function(a){var e,f,g,h,i,j,k,l,m,n,o,p,q;for(e=!1,f=[],g=0,h=null,i=0,l=0,m=0,j=0,k=0;i<a.length;)a[i][0]===d?(f[g++]=i,l=j,m=k,j=0,k=0,h=a[i][1]):(a[i][0]===c?j+=a[i][1].length:k+=a[i][1].length,h&&h.length<=Math.max(l,m)&&h.length<=Math.max(j,k)&&(a.splice(f[g-1],0,[b,h]),a[f[g-1]+1][0]=c,g--,g--,i=g>0?f[g-1]:-1,l=0,m=0,j=0,k=0,h=null,e=!0)),i++;for(e&&this.diffCleanupMerge(a),i=1;i<a.length;)a[i-1][0]===b&&a[i][0]===c&&(n=a[i-1][1],o=a[i][1],p=this.diffCommonOverlap(n,o),q=this.diffCommonOverlap(o,n),p>=q?(p>=n.length/2||p>=o.length/2)&&(a.splice(i,0,[d,o.substring(0,p)]),a[i-1][1]=n.substring(0,n.length-p),a[i+1][1]=o.substring(p),i++):(q>=n.length/2||q>=o.length/2)&&(a.splice(i,0,[d,n.substring(0,q)]),a[i-1][0]=c,a[i-1][1]=o.substring(0,o.length-q),a[i+1][0]=b,a[i+1][1]=n.substring(q),i++),i++),i++},a.prototype.diffCommonOverlap=function(a,b){var c,d,e,f,g,h,i;if(c=a.length,d=b.length,0===c||0===d)return 0;if(c>d?a=a.substring(c-d):c<d&&(b=b.substring(0,c)),e=Math.min(c,d),a===b)return e;for(f=0,g=1;;){if(h=a.substring(e-g),i=b.indexOf(h),i===-1)return f;g+=i,0!==i&&a.substring(e-g)!==b.substring(0,g)||(f=g,g++)}},a.prototype.diffLinesToChars=function(a,b){function g(a){var b,e,f,g,h;for(b="",e=0,f=-1,g=c.length;f<a.length-1;)f=a.indexOf("\n",e),f===-1&&(f=a.length-1),h=a.substring(e,f+1),e=f+1,(d.hasOwnProperty?d.hasOwnProperty(h):void 0!==d[h])?b+=String.fromCharCode(d[h]):(b+=String.fromCharCode(g),d[h]=g,c[g++]=h);return b}var c,d,e,f;return c=[],d={},c[0]="",e=g(a),f=g(b),{chars1:e,chars2:f,lineArray:c}},a.prototype.diffCharsToLines=function(a,b){var c,d,e,f;for(c=0;c<a.length;c++){for(d=a[c][1],e=[],f=0;f<d.length;f++)e[f]=b[d.charCodeAt(f)];a[c][1]=e.join("")}},a.prototype.diffCleanupMerge=function(a){var e,f,g,h,i,j,k;for(a.push([d,""]),e=0,f=0,g=0,i="",h="";e<a.length;)switch(a[e][0]){case c:g++,h+=a[e][1],e++;break;case b:f++,i+=a[e][1],e++;break;case d:f+g>1?(0!==f&&0!==g&&(j=this.diffCommonPrefix(h,i),0!==j&&(e-f-g>0&&a[e-f-g-1][0]===d?a[e-f-g-1][1]+=h.substring(0,j):(a.splice(0,0,[d,h.substring(0,j)]),e++),h=h.substring(j),i=i.substring(j)),j=this.diffCommonSuffix(h,i),0!==j&&(a[e][1]=h.substring(h.length-j)+a[e][1],h=h.substring(0,h.length-j),i=i.substring(0,i.length-j))),0===f?a.splice(e-g,f+g,[c,h]):0===g?a.splice(e-f,f+g,[b,i]):a.splice(e-f-g,f+g,[b,i],[c,h]),e=e-f-g+(f?1:0)+(g?1:0)+1):0!==e&&a[e-1][0]===d?(a[e-1][1]+=a[e][1],a.splice(e,1)):e++,g=0,f=0,i="",h=""}for(""===a[a.length-1][1]&&a.pop(),k=!1,e=1;e<a.length-1;)a[e-1][0]===d&&a[e+1][0]===d&&(a[e][1].substring(a[e][1].length-a[e-1][1].length)===a[e-1][1]?(a[e][1]=a[e-1][1]+a[e][1].substring(0,a[e][1].length-a[e-1][1].length),a[e+1][1]=a[e-1][1]+a[e+1][1],a.splice(e-1,1),k=!0):a[e][1].substring(0,a[e+1][1].length)===a[e+1][1]&&(a[e-1][1]+=a[e+1][1],a[e][1]=a[e][1].substring(a[e+1][1].length)+a[e+1][1],a.splice(e+1,1),k=!0)),e++;k&&this.diffCleanupMerge(a)},function(b,c){var d,e,f;return d=new a,e=d.DiffMain(b,c),d.diffCleanupEfficiency(e),f=d.diffPrettyHtml(e)}}(),function(){function e(a){return a?(a+="",a.replace(/['"<>&]/g,function(a){switch(a){case"'":return"&#039;";case'"':return"&quot;";case"<":return"&lt;";case">":return"&gt;";case"&":return"&amp;"}})):""}function f(a,b,c){a.addEventListener?a.addEventListener(b,c,!1):a.attachEvent&&a.attachEvent("on"+b,function(){var b=window.event;b.target||(b.target=b.srcElement||document),c.call(a,b)})}function g(a,b,c){for(var d=a.length;d--;)f(a[d],b,c)}function h(a,b){return(" "+a.className+" ").indexOf(" "+b+" ")>=0}function i(a,b){h(a,b)||(a.className+=(a.className?" ":"")+b)}function j(a,b){h(a,b)?k(a,b):i(a,b)}function k(a,b){for(var c=" "+a.className+" ";c.indexOf(" "+b+" ")>=0;)c=c.replace(" "+b+" "," ");a.className="function"==typeof c.trim?c.trim():c.replace(/^\s+|\s+$/g,"")}function l(a){return c.document&&document.getElementById&&document.getElementById(a)}function m(){var c,d,f,g,h,i=!1,j=a.urlConfig.length,k="";for(c=0;c<j;c++)if(f=a.urlConfig[c],"string"==typeof f&&(f={id:f,label:f}),g=e(f.id),h=e(f.tooltip),void 0===a[f.id]&&(a[f.id]=QUnit.urlParams[f.id]),f.value&&"string"!=typeof f.value){if(k+="<label for='qunit-urlconfig-"+g+"' title='"+h+"'>"+f.label+": </label><select id='qunit-urlconfig-"+g+"' name='"+g+"' title='"+h+"'><option></option>",QUnit.is("array",f.value))for(d=0;d<f.value.length;d++)g=e(f.value[d]),k+="<option value='"+g+"'"+(a[f.id]===f.value[d]?(i=!0)&&" selected='selected'":"")+">"+g+"</option>";else for(d in f.value)b.call(f.value,d)&&(k+="<option value='"+e(d)+"'"+(a[f.id]===d?(i=!0)&&" selected='selected'":"")+">"+e(f.value[d])+"</option>");a[f.id]&&!i&&(g=e(a[f.id]),k+="<option value='"+g+"' selected='selected' disabled='disabled'>"+g+"</option>"),k+="</select>"}else k+="<input id='qunit-urlconfig-"+g+"' name='"+g+"' type='checkbox'"+(f.value?" value='"+e(f.value)+"'":"")+(a[f.id]?" checked='checked'":"")+" title='"+h+"' /><label for='qunit-urlconfig-"+g+"' title='"+h+"'>"+f.label+"</label>";return k}function n(){var b,c,d=this,e={};c="selectedIndex"in d?d.options[d.selectedIndex].value||void 0:d.checked?d.defaultValue||!0:void 0,e[d.name]=c,b=o(e),"hidepassed"===d.name&&"replaceState"in window.history?(a[d.name]=c||!1,c?i(l("qunit-tests"),"hidepass"):k(l("qunit-tests"),"hidepass"),window.history.replaceState(null,"",b)):window.location=b}function o(a){var c,d="?";a=QUnit.extend(QUnit.extend({},QUnit.urlParams),a);for(c in a)if(b.call(a,c)){if(void 0===a[c])continue;d+=encodeURIComponent(c),a[c]!==!0&&(d+="="+encodeURIComponent(a[c])),d+="&"}return location.protocol+"//"+location.host+location.pathname+d.slice(0,-1)}function p(){var a,b=l("qunit-modulefilter"),c=l("qunit-filter-input").value;a=b?decodeURIComponent(b.options[b.selectedIndex].value):void 0,window.location=o({module:""===a?void 0:a,filter:""===c?void 0:c,testId:void 0})}function q(){var a=document.createElement("span");return a.innerHTML=m(),i(a,"qunit-url-config"),g(a.getElementsByTagName("input"),"click",n),g(a.getElementsByTagName("select"),"change",n),a}function r(){var b=document.createElement("form"),c=document.createElement("label"),d=document.createElement("input"),e=document.createElement("button");return i(b,"qunit-filter"),c.innerHTML="Filter: ",d.type="text",d.value=a.filter||"",d.name="filter",d.id="qunit-filter-input",e.innerHTML="Go",c.appendChild(d),b.appendChild(c),b.appendChild(e),f(b,"submit",function(a){return p(),a&&a.preventDefault&&a.preventDefault(),!1}),b}function s(){var a,b="";if(!d.length)return!1;for(d.sort(function(a,b){return a.localeCompare(b)}),b+="<label for='qunit-modulefilter'>Module: </label><select id='qunit-modulefilter' name='modulefilter'><option value='' "+(void 0===QUnit.urlParams.module?"selected='selected'":"")+">< All Modules ></option>",a=0;a<d.length;a++)b+="<option value='"+e(encodeURIComponent(d[a]))+"' "+(QUnit.urlParams.module===d[a]?"selected='selected'":"")+">"+e(d[a])+"</option>";return b+="</select>"}function t(){var a=l("qunit-testrunner-toolbar"),b=document.createElement("span"),c=s();return!(!a||!c)&&(b.setAttribute("id","qunit-modulefilter-container"),b.innerHTML=c,f(b.lastChild,"change",p),void a.appendChild(b))}function u(){var a=l("qunit-testrunner-toolbar");a&&(a.appendChild(q()),a.appendChild(r()))}function v(){var a=l("qunit-header");
a&&(a.innerHTML="<a href='"+o({filter:void 0,module:void 0,testId:void 0})+"'>"+a.innerHTML+"</a> ")}function w(){var a=l("qunit-banner");a&&(a.className="")}function x(){var a=l("qunit-tests"),b=l("qunit-testresult");b&&b.parentNode.removeChild(b),a&&(a.innerHTML="",b=document.createElement("p"),b.id="qunit-testresult",b.className="result",a.parentNode.insertBefore(b,a),b.innerHTML="Running...<br />&#160;")}function y(){var b=l("qunit-fixture");b&&(a.fixture=b.innerHTML)}function z(){var a=l("qunit-userAgent");a&&(a.innerHTML="",a.appendChild(document.createTextNode("QUnit "+QUnit.version+"; "+navigator.userAgent)))}function A(a){var b,c,e,f,g,h;for(b=0,c=a.length;b<c;b++)for(h=a[b],h.name&&d.push(h.name),e=0,f=h.tests.length;e<f;e++)g=h.tests[e],B(g.name,g.testId,h.name)}function B(a,b,c){var d,e,f,g,h=l("qunit-tests");h&&(d=document.createElement("strong"),d.innerHTML=C(a,c),e=document.createElement("a"),e.innerHTML="Rerun",e.href=o({testId:b}),f=document.createElement("li"),f.appendChild(d),f.appendChild(e),f.id="qunit-test-output-"+b,g=document.createElement("ol"),g.className="qunit-assert-list",f.appendChild(g),h.appendChild(f))}function C(a,b){var c="";return b&&(c="<span class='module-name'>"+e(b)+"</span>: "),c+="<span class='test-name'>"+e(a)+"</span>"}if(QUnit.init=function(){var a,b,c,d,f=QUnit.config;f.stats={all:0,bad:0},f.moduleStats={all:0,bad:0},f.started=0,f.updateRate=1e3,f.blocking=!1,f.autostart=!0,f.autorun=!1,f.filter="",f.queue=[],"undefined"!=typeof window&&(d=l("qunit"),d&&(d.innerHTML="<h1 id='qunit-header'>"+e(document.title)+"</h1><h2 id='qunit-banner'></h2><div id='qunit-testrunner-toolbar'></div><h2 id='qunit-userAgent'></h2><ol id='qunit-tests'></ol>"),a=l("qunit-tests"),b=l("qunit-banner"),c=l("qunit-testresult"),a&&(a.innerHTML=""),b&&(b.className=""),c&&c.parentNode.removeChild(c),a&&(c=document.createElement("p"),c.id="qunit-testresult",c.className="result",a.parentNode.insertBefore(c,a),c.innerHTML="Running...<br />&#160;"))},"undefined"!=typeof window){var a=QUnit.config,b=Object.prototype.hasOwnProperty,c={document:void 0!==window.document,sessionStorage:function(){var a="qunit-test-string";try{return sessionStorage.setItem(a,a),sessionStorage.removeItem(a),!0}catch(a){return!1}}()},d=[];QUnit.begin(function(b){var c=l("qunit");y(),c&&(c.innerHTML="<h1 id='qunit-header'>"+e(document.title)+"</h1><h2 id='qunit-banner'></h2><div id='qunit-testrunner-toolbar'></div><h2 id='qunit-userAgent'></h2><ol id='qunit-tests'></ol>"),v(),w(),x(),z(),u(),A(b.modules),t(),c&&a.hidepassed&&i(c.lastChild,"hidepass")}),QUnit.done(function(b){var d,e,f=l("qunit-banner"),g=l("qunit-tests"),h=["Tests completed in ",b.runtime," milliseconds.<br />","<span class='passed'>",b.passed,"</span> assertions of <span class='total'>",b.total,"</span> passed, <span class='failed'>",b.failed,"</span> failed."].join("");if(f&&(f.className=b.failed?"qunit-fail":"qunit-pass"),g&&(l("qunit-testresult").innerHTML=h),a.altertitle&&c.document&&document.title&&(document.title=[b.failed?"✖":"✔",document.title.replace(/^[\u2714\u2716] /i,"")].join(" ")),a.reorder&&c.sessionStorage&&0===b.failed)for(d=0;d<sessionStorage.length;d++)e=sessionStorage.key(d++),0===e.indexOf("qunit-test-")&&sessionStorage.removeItem(e);a.scrolltop&&window.scrollTo&&window.scrollTo(0,0)}),QUnit.testStart(function(a){var b,d,e;d=l("qunit-test-output-"+a.testId),d?d.className="running":B(a.name,a.testId,a.module),b=l("qunit-testresult"),b&&(e=QUnit.config.reorder&&c.sessionStorage&&+sessionStorage.getItem("qunit-test-"+a.module+"-"+a.name),b.innerHTML=(e?"Rerunning previously failed test: <br />":"Running: <br />")+C(a.name,a.module))}),QUnit.log(function(a){var c,d,f,g,h,i=l("qunit-test-output-"+a.testId);i&&(f=e(a.message)||(a.result?"okay":"failed"),f="<span class='test-message'>"+f+"</span>",f+="<span class='runtime'>@ "+a.runtime+" ms</span>",!a.result&&b.call(a,"expected")?(g=e(QUnit.dump.parse(a.expected)),h=e(QUnit.dump.parse(a.actual)),f+="<table><tr class='test-expected'><th>Expected: </th><td><pre>"+g+"</pre></td></tr>",h!==g?f+="<tr class='test-actual'><th>Result: </th><td><pre>"+h+"</pre></td></tr><tr class='test-diff'><th>Diff: </th><td><pre>"+QUnit.diff(g,h)+"</pre></td></tr>":g.indexOf("[object Array]")===-1&&g.indexOf("[object Object]")===-1||(f+="<tr class='test-message'><th>Message: </th><td>Diff suppressed as the depth of object is more than current max depth ("+QUnit.config.maxDepth+").<p>Hint: Use <code>QUnit.dump.maxDepth</code> to  run with a higher max depth or <a href='"+o({maxDepth:-1})+"'>Rerun</a> without max depth.</p></td></tr>"),a.source&&(f+="<tr class='test-source'><th>Source: </th><td><pre>"+e(a.source)+"</pre></td></tr>"),f+="</table>"):!a.result&&a.source&&(f+="<table><tr class='test-source'><th>Source: </th><td><pre>"+e(a.source)+"</pre></td></tr></table>"),c=i.getElementsByTagName("ol")[0],d=document.createElement("li"),d.className=a.result?"pass":"fail",d.innerHTML=f,c.appendChild(d))}),QUnit.testDone(function(b){var d,e,g,h,k,m,n,o,p=l("qunit-tests");p&&(g=l("qunit-test-output-"+b.testId),h=g.getElementsByTagName("ol")[0],k=b.passed,m=b.failed,a.reorder&&c.sessionStorage&&(m?sessionStorage.setItem("qunit-test-"+b.module+"-"+b.name,m):sessionStorage.removeItem("qunit-test-"+b.module+"-"+b.name)),0===m&&i(h,"qunit-collapsed"),d=g.firstChild,n=m?"<b class='failed'>"+m+"</b>, <b class='passed'>"+k+"</b>, ":"",d.innerHTML+=" <b class='counts'>("+n+b.assertions.length+")</b>",b.skipped?(g.className="skipped",o=document.createElement("em"),o.className="qunit-skipped-label",o.innerHTML="skipped",g.insertBefore(o,d)):(f(d,"click",function(){j(h,"qunit-collapsed")}),g.className=m?"fail":"pass",e=document.createElement("span"),e.className="runtime",e.innerHTML=b.runtime+" ms",g.insertBefore(e,h)))}),c.document?"complete"===document.readyState?QUnit.load():f(window,"load",QUnit.load):(a.pageLoaded=!0,a.autorun=!0)}}();
; browserify_shim__define__module__export__(typeof qunit != "undefined" ? qunit : window.qunit);

}).call(global, undefined, undefined, undefined, undefined, function defineExport(ex) { module.exports = ex; });

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
/* jshint undef:true, browser:true, node:true */
/* global QUnit, test, equal, asyncTest, start, define */

var startTests = function (lscache) {
  
  var originalConsole = window.console;

  QUnit.module('lscache', {
    setup: function() {
      // Reset localStorage before each test
      try {
        localStorage.clear();
      } catch(e) {}
    },
    teardown: function() {
      // Reset localStorage after each test
      try {
        localStorage.clear();
      } catch(e) {}
      window.console = originalConsole;
      lscache.enableWarnings(false);
    }
  });

  test('Testing set() and get() with string', function() {
    var key = 'thekey';
    var value = 'thevalue';
    var isSet = lscache.set(key, value, 1);
    if (isSet) {
      equal(lscache.get(key), value, 'We expect value to be ' + value);
    } else {
      equal(lscache.get(key), null, 'We expect null value');
    }
  });

  if (lscache.supported()) {

    test('Testing set() with non-string values', function() {
      var key, value;

      key = 'numberkey';
      value = 2;
      lscache.set(key, value, 3);
      equal(lscache.get(key)+1, value+1, 'We expect incremented value to be ' + (value+1));

      key = 'numberstring';
      value = '2';
      lscache.set(key, value, 3);
      equal(lscache.get(key), value, 'We expect number in string to be ' + value);

      key = 'arraykey';
      value = ['a', 'b', 'c'];
      lscache.set(key, value, 3);
      equal(lscache.get(key).length, value.length, 'We expect array to have length ' + value.length);

      key = 'objectkey';
      value = {'name': 'Pamela', 'age': 26};
      lscache.set(key, value, 3);
      equal(lscache.get(key).name, value.name, 'We expect name to be ' + value.name);
    });

    test('Testing remove()', function() {
      var key = 'thekey';
      lscache.set(key, 'bla', 2);
      lscache.remove(key);
      equal(lscache.get(key), null, 'We expect value to be null');
    });

    test('Testing flush()', function() {
      localStorage.setItem('outside-cache', 'not part of lscache');
      var key = 'thekey';
      lscache.set(key, 'bla', 100);
      lscache.flush();
      equal(lscache.get(key), null, 'We expect flushed value to be null');
      equal(localStorage.getItem('outside-cache'), 'not part of lscache', 'We expect localStorage value to still persist');
    });

    test('Testing set() fails with circular references', function() {
      var key, value;

      key = 'objectkey';
      value = {'name': 'Pamela', 'age': 26};
      value.itself = value;
      equal(lscache.set(key, value, 3), false, 'We expect the value cannot be stored');
      equal(lscache.get(key), null, 'We expect value was not stored');
    });

    test('Testing setBucket()', function() {
      var key = 'thekey';
      var value1 = 'awesome';
      var value2 = 'awesomer';
      var bucketName = 'BUCKETONE';

      lscache.set(key, value1, 1);
      lscache.setBucket(bucketName);
      lscache.set(key, value2, 1);

      equal(lscache.get(key), value2, 'We expect "' + value2 + '" to be returned for the current bucket: ' + bucketName);
      lscache.flush();
      equal(lscache.get(key), null, 'We expect "' + value2 + '" to be flushed for the current bucket');
      lscache.resetBucket();
      equal(lscache.get(key), value1, 'We expect "' + value1 + '", the non-bucket value, to persist');
    });

    test('Testing setWarnings()', function() {
      window.console = {
        calls: 0,
        warn: function() { this.calls++; }
      };

      var longString = (new Array(10000)).join('s');
      var num = 0;
      while(num < 10000) {
        try {
          localStorage.setItem("key" + num, longString);
          num++;
        } catch (e) {
          break;
        }
      }
      localStorage.clear();

      for (var i = 0; i <= num; i++) {
        lscache.set("key" + i, longString);
      }

      // Warnings not enabled, nothing should be logged
      equal(window.console.calls, 0);

      lscache.enableWarnings(true);

      lscache.set("key" + i, longString);
      equal(window.console.calls, 1, "We expect one warning to have been printed");

      window.console = null;
      lscache.set("key" + i, longString);
    });

    test('Testing quota exceeding', function() {
      var key = 'thekey';

      // Figure out this browser's localStorage limit -
      // Chrome is around 2.6 mil, for example
      var stringLength = 10000;
      var longString = (new Array(stringLength+1)).join('s');
      var num = 0;
      while(num < 10000) {
        try {
          localStorage.setItem(key + num, longString);
          num++;
        } catch (e) {
          break;
        }
      }
      localStorage.clear();
      // Now add enough to go over the limit
      var approxLimit = num * stringLength;
      var numKeys = Math.ceil(approxLimit/(stringLength+8)) + 1;
      var currentKey;
      var i = 0;

      for (i = 0; i <= numKeys; i++) {
        currentKey = key + i;
        equal(lscache.set(currentKey, longString, i+1), true, 'We expect new value to be added successfully');
      }
      // Test that last-to-expire is still there
      equal(lscache.get(currentKey), longString, 'We expect newest value to still be there');
      // Test that the first-to-expire is kicked out
      equal(lscache.get(key + '0'), null, 'We expect oldest value to be kicked out (null)');

      // Test trying to add something thats bigger than previous items,
      // check that it is successfully added (requires removal of multiple keys)
      var veryLongString = longString + longString;
      equal(lscache.set(key + 'long', veryLongString, i+1), true, 'We expect new value to be added successfully');
      equal(lscache.get(key + 'long'), veryLongString, 'We expect long string to get stored');

      // Try the same with no expiry times
      localStorage.clear();
      for (i = 0; i <= numKeys; i++) {
        currentKey = key + i;
        equal(lscache.set(currentKey, longString), true, 'We expect each value to be added successfully');
      }
      // Test that latest added is still there
      equal(lscache.get(currentKey), longString, 'We expect value to be set');
    });

    asyncTest('Testing set() and get() with string and expiration and different units', function() {
      var oldExpiryMilliseconds = lscache.getExpiryMilliseconds();
      var expiryMilliseconds = 1000;
      lscache.setExpiryMilliseconds(expiryMilliseconds);
      var key = 'thekey';
      var value = 'thevalue';
      var numExpiryUnits = 1;
      lscache.set(key, value, numExpiryUnits);
      equal(lscache.get(key), value, 'We expect value to be available pre-expiration');
      setTimeout(function() {
        equal(lscache.get(key), null, 'We expect value to be null');

        //restore the previous expiryMilliseconds setting
        lscache.setExpiryMilliseconds(oldExpiryMilliseconds);
        start();
      }, expiryMilliseconds*numExpiryUnits);
    });

    test('Testing single item exceeds quota', function() {
      var key = 'thekey';
      var stringLength = 10000;
      var longString = (new Array(stringLength+1)).join('s');

      // Figure out this browser's localStorage limit -
      // Chrome is around 2.6 mil, for example
      var num = 0;
      while(num < 10000) {
        try {
          localStorage.setItem(key + num, longString);
          num++;
        } catch (e) {
          break;
        }
      }
      localStorage.clear();
      // Now make string long enough to go over limit.
      var veryLongString  = (new Array(num+3)).join(longString);
      equal(lscache.set(key + 'long', veryLongString), false, 'We expect new value to be too long');
      equal(lscache.get(key + 'long'), null, 'We expect nothing was stored');
    });

    // We do this test last since it must wait 1 minute
    asyncTest('Testing set() and get() with string and expiration', 1, function() {

      var key = 'thekey';
      var value = 'thevalue';
      var minutes = 1;
      lscache.set(key, value, minutes);
      setTimeout(function() {
        equal(lscache.get(key), null, 'We expect value to be null');
        start();
      }, 1000*60*minutes);
    });

    asyncTest('Testing set() and get() with string and expiration in a different bucket', 2, function() {

      var key = 'thekey';
      var value1 = 'thevalue1';
      var value2 = 'thevalue2';
      var minutes = 1;
      var bucket = 'newbucket';
      lscache.set(key, value1, minutes * 2);
      lscache.setBucket(bucket);
      lscache.set(key, value2, minutes);
      setTimeout(function() {
        equal(lscache.get(key), null, 'We expect value to be null for the bucket: ' + bucket);
        lscache.resetBucket();
        equal(lscache.get(key), value1, 'We expect value to be ' + value1 + ' for the base bucket.');
        start();
      }, 1000*60*minutes);
    });

    asyncTest('Testing flush(expired)', function() {
      var oldExpiryMilliseconds = lscache.getExpiryMilliseconds();
      var expiryMilliseconds = 1;
      lscache.setExpiryMilliseconds(expiryMilliseconds);

      localStorage.setItem('outside-cache', 'not part of lscache');
      var unexpiredKey = 'unexpiredKey';
      var expiredKey = 'expiredKey';
      lscache.set(unexpiredKey, 'bla', 10000); // Expires in ten seconds
      lscache.set(expiredKey, 'blech', 1000); // Expire after one second

      equal(lscache.get(unexpiredKey), 'bla', 'Should not be expired yet');
      equal(lscache.get(expiredKey), 'blech', 'Should not be expired yet');

      setTimeout(function() {
        lscache.flushExpired();
        equal(lscache.get(unexpiredKey), 'bla', 'We expect unexpired value to survive flush');
        equal(lscache.get(expiredKey), null, 'We expect expired value to be flushed');
        equal(localStorage.getItem('outside-cache'), 'not part of lscache', 'We expect localStorage value to still persist');

        //restore the previous expiryMilliseconds setting
        lscache.setExpiryMilliseconds(oldExpiryMilliseconds);
        start();
      }, 1500);
    });

    test('Testing flushBucket', function() {
      // Fill a bunch of buckets
      var b, k;
      var numBuckets = 4;
      var numKeys = 12;
      for (b = 0; b < numBuckets; b++) {
        lscache.setBucket('bucket' + b);
        for (k = 0; k < numKeys; k++) {
          lscache.set('key' + k, 1);
        }
      }

      // Now flush them
      for (b = 0; b < numBuckets; b++) {
        lscache.setBucket('bucket' + b);
        lscache.flush();
        lscache.resetBucket();
      }

      // All keys should be removed
      for (b = 0; b < numBuckets; b++) {
        lscache.setBucket('bucket' + b);
        for (k = 0; k < numKeys; k++) {
          equal(lscache.get('key' + k), null, 'We expect flushed value to be null');
        }
      }
    });

  }

  QUnit.start();
};

if (typeof module !== "undefined" && module.exports) {

  var lscache = require('../lscache');
  require('qunit');
  startTests(lscache);
} else if (typeof define === 'function' && define.amd) {
 
  require.config({
    baseUrl: "./",
    paths: {
        "qunit": "qunit",
        "lscache": "../lscache"
    }
  });

  require(['lscache', 'qunit'], function (lscache, QUnit) {
    startTests(lscache);
  });
} else {
  // Assuming that lscache has been properly included
  startTests(lscache);
}

},{"../lscache":1,"qunit":2}]},{},[3]);

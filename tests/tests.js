/* jshint undef:true, browser:true, node:true */
/* global QUnit, test, equal, asyncTest, start, define */

var startTests = function (lscache) {

  var originalConsole = window.console;
  var CACHE_PREFIX = 'lscache-';

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
    lscache.set(key, value, 1);
    if (lscache.supported()) {
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
        lscache.set(currentKey, longString, i+1);
      }
      // Test that last-to-expire is still there
      equal(lscache.get(currentKey), longString, 'We expect newest value to still be there');
      // Test that the first-to-expire is kicked out
      equal(lscache.get(key + '0'), null, 'We expect oldest value to be kicked out (null)');

      // Test trying to add something thats bigger than previous items,
      // check that it is successfully added (requires removal of multiple keys)
      var veryLongString = longString + longString;
      lscache.set(key + 'long', veryLongString, i+1);
      equal(lscache.get(key + 'long'), veryLongString, 'We expect long string to get stored');

      // Try the same with no expiry times
      localStorage.clear();
      for (i = 0; i <= numKeys; i++) {
        currentKey = key + i;
        lscache.set(currentKey, longString);
      }
      // Test that latest added is still there
      equal(lscache.get(currentKey), longString, 'We expect value to be set');
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
      localStorage.setItem('outside-cache', 'not part of lscache');
      var unexpiredKey = 'unexpiredKey';
      var expiredKey = 'expiredKey';
      lscache.set(unexpiredKey, 'bla', 1);
      lscache.set(expiredKey, 'blech', 1/60); // Expire after one second

      setTimeout(function() {
        lscache.flushExpired();
        equal(lscache.get(unexpiredKey), 'bla', 'We expect unexpired value to survive flush');
        equal(lscache.get(expiredKey), null, 'We expect expired value to be flushed');
        equal(localStorage.getItem('outside-cache'), 'not part of lscache', 'We expect localStorage value to still persist');
        start();
      }, 1500);
    });

    asyncTest("Test isExpired() function", function() {
      var key = 'thekey';
      var value = 'thevalue';
      var minutes = 1;
      var strictEqual = window.strictEqual;

      lscache.set(key, value, minutes);

      setTimeout(function () {
        strictEqual(lscache.isExpired(key), true, 'Ensure the key is considered expired');
        start();
      }, 1000*60*minutes + 1000);  // 1 second longer
    });

    asyncTest("Test get() skipRemove/allowExpired parameters", function() {
      var key = 'thekey';
      var value = 'thevalue';
      var minutes = 1;
      var strictEqual = window.strictEqual;

      lscache.set(key, value, minutes);

      setTimeout(function () {
        strictEqual(lscache.get(key, true), null, 'get() should return null for the expired key');
        strictEqual(localStorage.getItem(CACHE_PREFIX + key), value, 'Ensure the value was not removed in the last get() call');
        strictEqual(lscache.get(key, true, true), value, 'get() should return the value when allowExpired is true');

        // Now, call without skipRemove, we should get the value but it should also be removed
        strictEqual(lscache.get(key, false, true), value, 'get() should return the value when allowExpired is true');
        strictEqual(localStorage.getItem(CACHE_PREFIX + key), null, 'Ensure the value was removed in the last get() call');

        start();
      }, 1000*60*minutes + 1000);  // 1 second longer
    });
  }

  if (QUnit.config.autostart === false) {
    QUnit.start();
  }
};

if (typeof module !== "undefined" && module.exports) {

  var lscache = require('../lscache');
  var qunit = require('qunit');
  startTests(lscache);
} else if (typeof define === 'function' && define.amd) {

  QUnit.config.autostart = false;
  require(['../lscache'], startTests);
} else {
  // Assuming that lscache has been properly included
  startTests(lscache);
}

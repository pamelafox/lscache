lscache
===============================
This is a simple library that emulates `memcache` functions using HTML5 `localStorage`, so that you can cache data on the client
and associate an expiration time with each piece of data. If the `localStorage` limit (~5MB) is exceeded, it tries to create space by removing the items that are closest to expiring anyway. If `localStorage` is not available at all in the browser, the library degrades by simply not caching and all cache requests return null.

Usage
-------

The interface should be familiar to those of you who have used `memcache`, and should be easy to understand for those of you who haven't.

For example, you can store a string for 2 seconds using `lscache.set()`:
    `lscache.set('greeting', 'Hello World!', 2);`

You can then retrieve that string with `lscache.get()`:
    `alert(lscache.get('greeting'));`

You can remove that string from the cache entirely with `lscache.remove()`:
    `lscache.remove('greeting');`

The library also takes care of serializing objects, so you can store more complex data:
    `lscache.set('data', {'name': 'Pamela', 'age': 26}, 2);`

And then when you retrieve it, you will get it back as an object:
    `alert(lscache.get('data').name);`

For more live examples, play around with the demo here:
http://pamelafox.github.com/lscache/lscache_demo.html


Real-World Usage
----------
This library was originally developed with the use case of caching results of JSON API queries
to speed up my webapps and give them better protection against flaky APIs.
(More on that in this [blog post](http://blog.pamelafox.org/2010/10/lscache-localstorage-based-memcache.html))

For example, [RageTube](http://ragetube.net) uses `lscache` to fetch Youtube API results for 10 minutes:

    var key = 'youtube:' + query;
    var json = lscache.get(key);
    if (json) {
      processJSON(json);
    } else {
      fetchJSON(query);
    }

    function processJSON(json) {
      // ..
    }

    function fetchJSON() {
      var searchUrl = 'http://gdata.youtube.com/feeds/api/videos';
      var params = {
      'v': '2', 'alt': 'jsonc', 'q': encodeURIComponent(query)
      }
      JSONP.get(searchUrl, params, null, function(json) {
        processJSON(json);
        lscache.set(key, json, 60*10);
      });
    }

It does not have to be used for only expiration-based caching, however. It can also be used as just a wrapper for `localStorage`, as it provides the benefit of
handling JS object (de-)serialization.

For example, the [QuizCards](http://quizcards.info) Chrome extensions use `lscache`
to store the user statistics for each user bucket, and those stats are an array
of objects.

    function initBuckets() {
      var bucket1 = [];
      for (var i = 0; i < CARDS_DATA.length; i++) {
        var datum = CARDS_DATA[i];
        bucket1.push({'id': datum.id, 'lastAsked': 0});
      }
      set(LS_BUCKET + 1, bucket1);
      set(LS_BUCKET + 2, []);
      set(LS_BUCKET + 3, []);
      set(LS_BUCKET + 4, []);
      set(LS_BUCKET + 5, []);
      set(LS_INIT, 'true')
    }

Browser Support
----------------

The `lscache` library should work in all browsers where `localStorage` is supported.
A list of those is here:
http://www.quirksmode.org/dom/html5.html


![Build Status](https://travis-ci.org/brophdawg11/lscache-extra.svg?branch=master)

lscache-extra
===============================
This is a simple library that emulates `memcache` functions using HTML5 `localStorage`, so that you can cache data on the client
and associate an expiration time with each piece of data. If the `localStorage` limit (~5MB) is exceeded, it tries to create space by removing the items that are closest to expiring anyway. If `localStorage` is not available at all in the browser, the library degrades by simply not caching and all cache requests return null.

Additional Functionality
------------------------
This library is a fork of @pamelafox's [lscache library](https://github.com/pamelafox/lscache), with a little extra functionality exposed.  Namely, the `skipRemove` and `allowExpired` parameters for `get()` and the `isExpired()` and `setExpiryUnitMs()` functions.

Use with Angular
----------------
If you're using this library with Angular, it takes care of registering itself as a constant within an 'lscacheExtra' module, i.e.,

`angular.module('lscacheExtra', []).constant('lscacheExtra', lscacheExtra);`


Methods
-------

The library exposes 7 methods: `set()`, `get()`, `isExpired()`, `setExpiryUnitMs()`, `remove()`, `flush()`, and `setBucket()`.

* * *

### lscache.set
Stores the value in localStorage. Expires after specified number of minutes.
#### Arguments
1. `key` (**string**)
2. `value` (**Object|string**)
3. `time` (**number: optional**)

* * *

### lscache.get
Retrieves specified value from localStorage, if not expired.
#### Arguments
1. `key` (**string**)
2. `skipRemove` (**boolean**)  Don't remove the item if it is found to be expired [Default: false]
3. `allowExpired` (**boolean**)  Allow returning of expired values  [Default: false]
#### Returns
**string | Object** : The stored value.

* * *

### lscache.isExpired
Returned whether or not the given key is expired
#### Arguments
1. `key` (**string**)
#### Returns
**boolean** : Whether or not the cached value is expired

* * *

### lscache.setExpiryUnitMs
Change the units used for cache expiration.  Default is minutes (60 * 1000).

Note: this flushes the lscache as well if the units differ from what
was previously used, to ensure that no prior data, using a different
unit, remains in an invalid cache state
#### Arguments
1. `ms` (**number**)

* * *

### lscache.remove
Removes a value from localStorage.
#### Arguments
1. `key` (**string**)

* * *

### lscache.flush
Removes all lscache items from localStorage without affecting other data.

* * *

### lscache.setBucket
Appends CACHE_PREFIX so lscache will partition data in to different buckets
#### Arguments
1. `bucket` (**string**)

Usage
-------

The interface should be familiar to those of you who have used `memcache`, and should be easy to understand for those of you who haven't.

For example, you can store a string for 2 minutes using `lscache.set()`:

```js
lscache.set('greeting', 'Hello World!', 2);
```

You can then retrieve that string with `lscache.get()`:

```js
alert(lscache.get('greeting'));
```

You can remove that string from the cache entirely with `lscache.remove()`:

```js
lscache.remove('greeting');
```

You can remove all items from the cache entirely with `lscache.flush()`:

```js
lscache.flush();
```

The library also takes care of serializing objects, so you can store more complex data:

```js
lscache.set('data', {'name': 'Pamela', 'age': 26}, 2);
```

And then when you retrieve it, you will get it back as an object:

```js
alert(lscache.get('data').name);
```

If you have multiple instances of lscache running on the same domain, you can partition data in a certain bucket via:

```js
lscache.set('response', '...', 2);
lscache.setBucket('lib');
lscache.set('path', '...', 2);
lscache.flush(); //only removes 'path' which was set in the lib bucket
```

For more live examples, play around with the demo here:
http://pamelafox.github.com/lscache/demo.html


Real-World Usage
----------
This library was originally developed with the use case of caching results of JSON API queries
to speed up my webapps and give them better protection against flaky APIs.
(More on that in this [blog post](http://blog.pamelafox.org/2010/10/lscache-localstorage-based-memcache.html))

For example, [RageTube](http://ragetube.net) uses `lscache` to fetch Youtube API results for 10 minutes:

```js
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
    lscache.set(key, json, 10);
  });
}
```

It does not have to be used for only expiration-based caching, however. It can also be used as just a wrapper for `localStorage`, as it provides the benefit of handling JS object (de-)serialization.

For example, the [QuizCards](http://quizcards.info) Chrome extensions use `lscache`
to store the user statistics for each user bucket, and those stats are an array
of objects.

```js
function initBuckets() {
  var bucket1 = [];
  for (var i = 0; i < CARDS_DATA.length; i++) {
    var datum = CARDS_DATA[i];
    bucket1.push({'id': datum.id, 'lastAsked': 0});
  }
  lscache.set(LS_BUCKET + 1, bucket1);
  lscache.set(LS_BUCKET + 2, []);
  lscache.set(LS_BUCKET + 3, []);
  lscache.set(LS_BUCKET + 4, []);
  lscache.set(LS_BUCKET + 5, []);
  lscache.set(LS_INIT, 'true')
}
```

Browser Support
----------------

The `lscache` library should work in all browsers where `localStorage` is supported.
A list of those is here:
http://www.quirksmode.org/dom/html5.html


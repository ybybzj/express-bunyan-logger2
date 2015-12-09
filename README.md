# Express-bunyan-logger2
Fork of express-bunyan-logger, credit for [express-bunyan-logger](https://github.com/villadora/express-bunyan-logger)

### Added Option
#### color [Boolean|Object]

default: false

default color scheme: 
```js
{
    'remote-address': 'white',
    'user-agent': 'yellow',
    'status-code': 'cyan',
    'response-time': 'green',
    'short-body': 'gray',
    'body': 'gray'
}
```
Value of color scheme object can be a function, and the value of `meta[property]` will be passed in to the function. Like,
```js
{
    'response-time': function(resTime){
        //'resTime' is equal to 'meta['response-time']'
        return resTime < 200 ? 'green': 'red';
    }
}
```

#### excludes [String|[String]]

default: []

The final meta properies will be computed according to the value of `excludes`.

Default meta properties are:
```js
[
    'remote-address',
    'ip',
    'method',
    'url',
    'referer',
    'user-agent',
    'body',
    'short-body',
    'http-version',
    'response-time',
    "response-hrtime",
    "status-code",
    'req-headers',
    'res-headers',
    'req',
    'res',
    'incoming'
]
```
If you don't want some properties to be logged, just include their names in the `excludes` option.

Put `!` before the name if you do want include the property.
Useful when '*' is passed in, and you still want several of them to be included.
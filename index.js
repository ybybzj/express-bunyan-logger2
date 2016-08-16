var bunyan = require('bunyan'),
    useragent = require('useragent'),
    uuid = require('node-uuid'),
    util = require('util'),
    Chalk = require('chalk').constructor,
    xtend = require('xtend');
var defaultStyles = {
    'remote-address': 'white',
    'user-agent': 'yellow',
    'status-code': 'cyan',
    'response-time': 'green',
    'short-body': 'gray',
    'body': 'gray'
};

module.exports = function (opts) {
    var logger = module.exports.errorLogger(opts);
    return function (req, res, next) {
        logger(null, req, res, next);
    };
};


module.exports.errorLogger = function (opts) {
    var logger, opts = opts || {}, format,
        immediate = false,
        parseUA = true,
        excludes,
        valueMappings,
        genReqId = defaultGenReqId,
        levelFn = defaultLevelFn,
        includesFn,
        colorEnabled = !!opts.color,
        chalk = new Chalk({enabled: colorEnabled}),
        styles = xtend(defaultStyles, Object(opts.color)===opts.color ? opts.color : null),
        clr = function(name, meta){
            return function(str){
                if(!colorEnabled) return str;
                var style = styles[name],
                    styleFn = typeof style === 'function' ? chalk[style(meta[name])] : chalk[style];

                return typeof styleFn === 'function' ? styleFn(str) : str;
            };
        };

    delete opts.color;
    
    if (opts.logger) {
      logger = opts.logger;
    }

    // default format 
    format = opts.format || ":remote-address :incoming :method :url HTTP/:http-version :status-code :res-headers[content-length] :referer :user-agent[family] :user-agent[major].:user-agent[minor] :user-agent[os] :response-time ms";
    delete opts.format; // don't pass it to bunyan
    (typeof format != 'function') && (format = compile(format, clr));

    opts.hasOwnProperty('parseUA') && (parseUA = opts.parseUA, delete opts.parseUA);

    if (opts.immediate) {
        immediate = opts.immediate;
        delete opts.immediate;
    }

    if (opts.levelFn) {
        levelFn = opts.levelFn;
        delete opts.levelFn;
    }

    if(opts.valueMappingFn){
      valueMappingFn = opts.valueMappingFn;
      delete opts.valueMappingFn;
    }

    
    excludes = [].concat(opts.excludes).filter(Boolean);
    delete opts.excludes;
    

    if (opts.includesFn) {
        includesFn = opts.includesFn;
        delete opts.includesFn;
    }


    if (opts.genReqId) {
        genReqId = typeof genReqId == 'function' ? opts.genReqId : defaultGenReqId;
    }else if (opts.hasOwnProperty('genReqId')) {
        genReqId = false;
    }

    return function (err, req, res, next) {
        var startTime = process.hrtime();
        
        var app = req.app || res.app;

        var valueMappings;


        if (!logger) {
            opts.name = (opts.name || app.settings.shortname || app.settings.name || app.settings.title || 'express');
            opts.serializers = opts.serializers || {};
            opts.serializers.req = opts.serializers.req || bunyan.stdSerializers.req;
            opts.serializers.res = opts.serializers.res || bunyan.stdSerializers.res;
            err && (opts.serializers.err = opts.serializers.err || bunyan.stdSerializers.err);
            logger = bunyan.createLogger(opts);
        }

        var requestId;

        if (genReqId) 
          requestId = genReqId(req);

        if(valueMappingFn){
          valueMappings = valueMappingFn(req, res);
        }

        var childLogger = requestId !== undefined ? logger.child({req_id: requestId}) : logger;
        req.log = childLogger;

        function logging(incoming) {
            if (!incoming) {
                res.removeListener('finish', logging);
                res.removeListener('close', logging);
            }

            var status = res.statusCode,
                method = req.method,
                url = (req.baseUrl || '') + (req.url || '-'),
                referer = req.header('referer') || req.header('referrer') || '-',
                ua = parseUA ? useragent.parse(req.header('user-agent')) : req.header('user-agent'),
                httpVersion = req.httpVersionMajor + '.' + req.httpVersionMinor,
                hrtime = process.hrtime(startTime),
                responseTime = hrtime[0] * 1e3 + hrtime[1] / 1e6,
                ip, logFn;

            ip = ip || req.ip || req.connection.remoteAddress ||
                (req.socket && req.socket.remoteAddress) ||
                (req.socket.socket && req.socket.socket.remoteAddress) ||
                '127.0.0.1';

            var meta = {
                'remote-address': ip,
                'ip': ip,
                'method': method,
                'url': url,
                'referer': referer,
                'user-agent': ua,
                'body': req.body,
                'short-body': util.inspect(req.body).substring(0, 20),
                'http-version': httpVersion,
                'response-time': responseTime,
                "response-hrtime": hrtime,
                "status-code": status,
                'req-headers': req.headers,
                'res-headers': res._headers,
                'req': req,
                'res': res,
                'incoming':incoming?'-->':'<--'
            };

            if(valueMappings){
              meta = xtend({}, meta, valueMappings); 
            }
            err && (meta.err = err);

            var level = levelFn(status, err, meta);
            logFn = childLogger[level] ? childLogger[level] : childLogger.info;

            var json = filterExcludes(meta, excludes);

            if (includesFn) {
                var includes = includesFn(req, res);

                if (includes) {
                    for (var p in includes) {
                        json[p] = includes[p];
                    }
                }
            }

            if (!Object.keys(json).length) {
                logFn.call(childLogger, format(meta));
            } else {
                logFn.call(childLogger, json, format(meta));
            }
        }


        if (immediate) {
            logging(true);
        } else {
            res.on('finish', logging);
            res.on('close', logging);
        }

        next(err);
    };
};

function filterExcludes(meta, excludes){
    var i = excludes.indexOf('*'), l = excludes.length, e, result = xtend({}, meta);
    if(i !== -1) result = {};
    for(i = i+1; i < l; i++){
        e = excludes[i];
        if(e[0] === '!'){
            e = e.slice(1);
            result[e] = meta[e];
        }else{
            delete result[e];
        }
    }
    return result;
}
function compile(fmt, clr) {
    return function(meta){
        return fmt.replace(/:([-\w]{2,})(?:\[([^\]]+)\])?/g, function(_, name, key){
            var c = clr(name, meta);
            if (key){
                return c(meta[name] ? (meta[name][key] || (typeof meta[name][key] === 'number'? '0' : '-')) : '-');
            }
            return c(meta[name] || (typeof meta[name] === 'number'? '0' : '-'));
        });
    };
}


function defaultLevelFn(status, err) {
    if (err || status >= 500) { // server internal error or error
        return "error";
    } else if (status >= 400) { // client error
        return "warn";
    }
    return "info";
}



function defaultGenReqId(req) {
  var requestId = uuid.v4();
  req.id = requestId;
  return requestId;
}

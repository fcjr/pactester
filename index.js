#!/usr/bin/env node
const dns = require("node:dns");
const { readFileSync, createReadStream } = require("node:fs");
const os = require("node:os");
const readline = require("node:readline");

// TODO don't use deasync
const deasync = require("deasync");
const _dnsLookup = deasync(dns.lookup);

function dnsResolve(host) {
  try {
    var ips = _dnsLookup(host);
    if (ips && ips.length >= 1) {
      return ips[0];
    }
    return null;
  } catch (_) {
    return null;
  }
}

var _client_ip = null;

function myIpAddress() {
  if (_client_ip !== null) {
    return _client_ip;
  }
  const ip = _dnsLookup(os.hostname());
  return ip ? ip : "127.0.0.1";
}

// The rest were extracted from https://hg.mozilla.org/mozilla-central/raw-file/6aa3b57955fed5e137d0306478e1a4b424a6d392/netwerk/base/ProxyAutoConfig.cpp
// for license info see: https://www.mozilla.org/en-US/foundation/licensing/

function dnsDomainIs(host, domain) {
  return (
    host.length >= domain.length &&
    host.substring(host.length - domain.length) == domain
  );
}

function dnsDomainLevels(host) {
  return host.split(".").length - 1;
}

function isValidIpAddress(ipchars) {
  var matches = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ipchars);
  if (matches == null) {
    return false;
  } else if (
    matches[1] > 255 ||
    matches[2] > 255 ||
    matches[3] > 255 ||
    matches[4] > 255
  ) {
    return false;
  }
  return true;
}

function convert_addr(ipchars) {
  var bytes = ipchars.split(".");
  var result =
    ((bytes[0] & 0xff) << 24) |
    ((bytes[1] & 0xff) << 16) |
    ((bytes[2] & 0xff) << 8) |
    (bytes[3] & 0xff);
  return result;
}

function isInNet(ipaddr, pattern, maskstr) {
  if (!isValidIpAddress(pattern) || !isValidIpAddress(maskstr)) {
    return false;
  }
  if (!isValidIpAddress(ipaddr)) {
    ipaddr = dnsResolve(ipaddr);
    if (ipaddr == null) {
      return false;
    }
  }
  var host = convert_addr(ipaddr);
  var pat = convert_addr(pattern);
  var mask = convert_addr(maskstr);
  return (host & mask) == (pat & mask);
}

function isPlainHostName(host) {
  return host.search("\\.") == -1;
}

function isResolvable(host) {
  var ip = dnsResolve(host);
  return ip != null;
}

function localHostOrDomainIs(host, hostdom) {
  return host == hostdom || hostdom.lastIndexOf(host + ".", 0) == 0;
}

function shExpMatch(url, pattern) {
  pattern = pattern.replace(/\./g, "\\.");
  pattern = pattern.replace(/\*/g, ".*");
  pattern = pattern.replace(/\?/g, ".");
  var newRe = new RegExp("^" + pattern + "$");
  return newRe.test(url);
}

var wdays = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
var months = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function weekdayRange() {
  function getDay(weekday) {
    if (weekday in wdays) {
      return wdays[weekday];
    }
    return -1;
  }
  var date = new Date();
  var argc = arguments.length;
  var wday;
  if (argc < 1) return false;
  if (arguments[argc - 1] == "GMT") {
    argc--;
    wday = date.getUTCDay();
  } else {
    wday = date.getDay();
  }
  var wd1 = getDay(arguments[0]);
  var wd2 = argc == 2 ? getDay(arguments[1]) : wd1;
  return wd1 == -1 || wd2 == -1
    ? false
    : wd1 <= wd2
    ? wd1 <= wday && wday <= wd2
    : wd2 >= wday || wday >= wd1;
}

function dateRange() {
  function getMonth(name) {
    if (name in months) {
      return months[name];
    }
    return -1;
  }
  var date = new Date();
  var argc = arguments.length;
  if (argc < 1) {
    return false;
  }
  var isGMT = arguments[argc - 1] == "GMT";

  if (isGMT) {
    argc--;
  }
  // function will work even without explict handling of this case
  if (argc == 1) {
    var tmp = parseInt(arguments[0]);
    if (isNaN(tmp)) {
      return (
        (isGMT ? date.getUTCMonth() : date.getMonth()) == getMonth(arguments[0])
      );
    } else if (tmp < 32) {
      return (isGMT ? date.getUTCDate() : date.getDate()) == tmp;
    } else {
      return (isGMT ? date.getUTCFullYear() : date.getFullYear()) == tmp;
    }
  }
  var year = date.getFullYear();
  var date1, date2;
  date1 = new Date(year, 0, 1, 0, 0, 0);
  date2 = new Date(year, 11, 31, 23, 59, 59);
  var adjustMonth = false;
  for (var i = 0; i < argc >> 1; i++) {
    var tmp = parseInt(arguments[i]);
    if (isNaN(tmp)) {
      var mon = getMonth(arguments[i]);
      date1.setMonth(mon);
    } else if (tmp < 32) {
      adjustMonth = argc <= 2;
      date1.setDate(tmp);
    } else {
      date1.setFullYear(tmp);
    }
  }
  for (var i = argc >> 1; i < argc; i++) {
    var tmp = parseInt(arguments[i]);
    if (isNaN(tmp)) {
      var mon = getMonth(arguments[i]);
      date2.setMonth(mon);
    } else if (tmp < 32) {
      date2.setDate(tmp);
    } else {
      date2.setFullYear(tmp);
    }
  }
  if (adjustMonth) {
    date1.setMonth(date.getMonth());
    date2.setMonth(date.getMonth());
  }
  if (isGMT) {
    var tmp = date;
    tmp.setFullYear(date.getUTCFullYear());
    tmp.setMonth(date.getUTCMonth());
    tmp.setDate(date.getUTCDate());
    tmp.setHours(date.getUTCHours());
    tmp.setMinutes(date.getUTCMinutes());
    tmp.setSeconds(date.getUTCSeconds());
    date = tmp;
  }
  return date1 <= date2
    ? date1 <= date && date <= date2
    : date2 >= date || date >= date1;
}

function timeRange() {
  var argc = arguments.length;
  var date = new Date();
  var isGMT = false;
  if (argc < 1) {
    return false;
  }
  if (arguments[argc - 1] == "GMT") {
    isGMT = true;
    argc--;
  }

  var hour = isGMT ? date.getUTCHours() : date.getHours();
  var date1, date2;
  date1 = new Date();
  date2 = new Date();

  if (argc == 1) {
    return hour == arguments[0];
  } else if (argc == 2) {
    return arguments[0] <= hour && hour <= arguments[1];
  } else {
    switch (argc) {
      case 6:
        date1.setSeconds(arguments[2]);
        date2.setSeconds(arguments[5]);
      case 4:
        var middle = argc >> 1;
        date1.setHours(arguments[0]);
        date1.setMinutes(arguments[1]);
        date2.setHours(arguments[middle]);
        date2.setMinutes(arguments[middle + 1]);
        if (middle == 2) {
          date2.setSeconds(59);
        }
        break;
      default:
        throw "timeRange: bad number of arguments";
    }
  }

  if (isGMT) {
    date.setFullYear(date.getUTCFullYear());
    date.setMonth(date.getUTCMonth());
    date.setDate(date.getUTCDate());
    date.setHours(date.getUTCHours());
    date.setMinutes(date.getUTCMinutes());
    date.setSeconds(date.getUTCSeconds());
  }
  return date1 <= date2
    ? date1 <= date && date <= date2
    : date2 >= date || date >= date1;
}

// End Mozilla code.

function getHostFromUrl(url) {
  // Adapted from get_host_from_url to match it's logic
  // https://github.com/manugarg/pacparser/blob/943231b2a33e2d7b26128d35a882792feb3fa621/src/pactester.c#L58
  const [, ...urlParts] = url.split(":");
  var urlWithoutProtocol = urlParts.join(":");
  if (urlParts.length < 1 || !urlWithoutProtocol.startsWith("//")) {
    console.error("Not a proper URL");
    process.exit(1);
  }

  var host = urlWithoutProtocol.substr(2);
  if (host.length <= 0 || host.startsWith("/") || host.startsWith(":")) {
    console.error("Not a proper URL");
    process.exit(1);
  }

  // Seek until next /, : or end of string.
  const nextSlash = host.indexOf("/");
  const nextColon = host.indexOf(":");
  if (nextSlash > 0 || nextColon > 0) {
    host =
      nextSlash < nextColon
        ? host.substr(0, nextSlash)
        : host.substr(0, nextColon);
  }
  return host;
}

// ------ PROGRAM ------

const { program } = require("commander");

program
  .name("pactester")
  .description(
    "Pure JS* implementation of pactester. \n\n * (Almost.  Currently still relies on c++.)"
  )
  .helpOption(false)
  .version("0.0.3", "-v")
  .option(
    "-p <pacfile>",
    "PAC file to test (specify '-' to read from standard input)"
  )
  .option("-u <url>", "URL to test for")
  .option("-h <host>", "Host part of the URL")
  .option(
    "-c <client_ip>",
    "client IP address (as returned by myIpAddress() function in PAC files), defaults to IP address on which it is running."
  )
  .option("-f <urlslist>", "a file containing list of URLs to be tested.")
  .option("-v", "print version and exit");
// .option("-e", "Deprecated: IPv6 extensions are enabled by default now.")

program.parse();

const options = program.opts();
const pacfile = options?.p;
const url = options?.u;
var host = options?.h;
const client_ip = options?.c;
const urlslist = options?.f;

if (Object.entries(options).length === 0) {
  program.help();
}

if (!pacfile) {
  console.error("You didn't specify the PAC file");
  program.help();
}
if (!url && !urlslist) {
  console.error("You didn't specify the URL");
  program.help();
}

if (pacfile === "-") {
  // Read pacfile from stdin.
  const stdin = readFileSync(process.stdin.fd, "utf-8");
  if (!stdin || stdin.length <= 0) {
    console.error("Expected piped data but found none");
    process.exit(1);
  }
  eval(stdin);
} else {
  eval(readFileSync(pacfile).toString());
}

if (!FindProxyForURL || typeof FindProxyForURL !== "function") {
  console.error(
    `Failed to find FindProxyForURL function in pac file: ${pacfile}.`
  );
  process.exit(1);
}

if (client_ip) {
  _client_ip = client_ip;
}

if (url) {
  // If the host was not explicitly given, get it from the URL.
  // If that fails, return with error (the get_host_from_url()
  // function will print a proper error message in that case).
  if (!host) {
    host = getHostFromUrl(url);
  }

  console.log(FindProxyForURL(url, host));
  process.exit(0);
} else if (urlslist) {
  const reader = readline.createInterface({
    input: createReadStream(urlslist),
    output: process.stdout,
    terminal: false,
  });

  reader.on("line", (line) => {
    // trim whitespace
    line = line.trim();

    // skip comments
    if (line.startsWith("#")) {
      console.log(line);
      return;
    }

    // url == everything before the first space
    const url = line.split(" ")[0];
    try {
      const proxy = FindProxyForURL(url, getHostFromUrl(url));
      console.log(`${url} : ${proxy}`);
    } catch (e) {
      console.error(`Problem in finding proxy for ${line}`);
      process.exit(1);
    }
  });
}

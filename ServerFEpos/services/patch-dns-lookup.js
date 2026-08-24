/**
 * Windows: dns.lookup() puede fallar (ENOTFOUND) aunque dns.resolve4() funcione.
 * Parchea lookup respetando las opciones de Node (all, family) para axios/soap.
 */
const dns = require('dns');
const dnsPromises = require('dns/promises');

async function resolveHostAddresses(hostname, opts = {}) {
  const results = [];

  if (opts.family !== 6) {
    try {
      for (const address of await dnsPromises.resolve4(hostname)) {
        results.push({ address, family: 4 });
      }
    } catch {
      // sin A
    }
  }

  if (opts.family !== 4) {
    try {
      for (const address of await dnsPromises.resolve6(hostname)) {
        results.push({ address, family: 6 });
      }
    } catch {
      // sin AAAA
    }
  }

  if (!results.length) {
    const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    err.code = 'ENOTFOUND';
    err.hostname = hostname;
    throw err;
  }

  return results;
}

if (!dns.__conexaLookupPatched) {
  dns.setDefaultResultOrder('ipv4first');
  const originalLookup = dns.lookup;

  dns.lookup = function patchedLookup(hostname, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    } else if (!opts) {
      opts = {};
    }

    resolveHostAddresses(hostname, opts)
      .then((addresses) => {
        if (opts.all) {
          cb(null, addresses);
          return;
        }
        const pick = opts.family === 6
          ? addresses.find((entry) => entry.family === 6) || addresses[0]
          : addresses.find((entry) => entry.family === 4) || addresses[0];
        cb(null, pick.address, pick.family);
      })
      .catch((err) => originalLookup.call(dns, hostname, opts, cb));
  };

  dns.__conexaLookupPatched = true;
}

module.exports = { resolveHostAddresses };

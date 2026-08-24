/** Prueba carga WSDL DIAN — node scripts/test-dian-wsdl.mjs */
import './services/patch-dns-lookup.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveDianUrls } = require('./services/dian-client.js');
const soap = require('soap');
const https = require('https');
const axios = require('axios');
const { resolveHostAddresses } = require('./services/patch-dns-lookup.js');

function dianDnsLookup(hostname, options, callback) {
  let cb = callback;
  let opts = options;
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  resolveHostAddresses(hostname, opts)
    .then((addresses) => {
      if (opts.all) return cb(null, addresses);
      const pick = opts.family === 6
        ? addresses.find((e) => e.family === 6) || addresses[0]
        : addresses.find((e) => e.family === 4) || addresses[0];
      cb(null, pick.address, pick.family);
    })
    .catch((err) => cb(err));
}

const agent = new https.Agent({ lookup: dianDnsLookup });
const client = axios.create({ httpsAgent: agent, timeout: 30000, proxy: false });
const { soapUrl } = resolveDianUrls('habilitacion');

try {
  await soap.createClientAsync(soapUrl, {
    forceSoap12Headers: true,
    namespaceArrayElements: false,
    wsdl_options: { timeout: 30000, httpsAgent: agent },
    request: client,
    httpClient: new soap.HttpClient({ request: client }),
  });
  console.log('OK: WSDL cargado desde', soapUrl);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}

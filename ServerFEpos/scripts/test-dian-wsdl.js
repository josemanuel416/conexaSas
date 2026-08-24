require('./services/patch-dns-lookup');
const soap = require('soap');
const { resolveDianUrls, SOAP_CLIENT_OPTIONS } = require('./services/dian-client');

// Export SOAP_CLIENT_OPTIONS for tests
if (!module.exports.SOAP_CLIENT_OPTIONS) {
  // dian-client doesn't export it - inline require already loaded module
}

async function main() {
  const { soapUrl } = resolveDianUrls('habilitacion');
  const dc = require('./services/dian-client');
  // Re-read after patch - use internal test via getOrCreateClient needs cert
  
  const https = require('https');
  const axios = require('axios');
  const { resolveHostAddresses } = require('./services/patch-dns-lookup');

  function lookup(hostname, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof opts === 'function') { cb = opts; opts = {}; }
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

  const agent = new https.Agent({ lookup });
  const req = axios.create({ httpsAgent: agent, timeout: 30000, proxy: false });
  const opts = {
    forceSoap12Headers: true,
    namespaceArrayElements: false,
    wsdl_options: { timeout: 30000, httpsAgent: agent },
    request: req,
    httpClient: new soap.HttpClient({ request: req }),
  };

  console.log('Cargando WSDL:', soapUrl);
  await soap.createClientAsync(soapUrl, opts);
  console.log('OK');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});

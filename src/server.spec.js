const server = require('./server');
const axios = require('axios');
const assert = require('assert');
const generateTestEvent = require('../test-utils/generate-test-event');
const randomizeIngressPath = require('../test-utils/randomize-ingress-path');
const startMockDataServer = require('../test-utils/start-mock-data-server');
const collectRequestHeader = require('../test-utils/collect-request-header');
const collectRequestBody = require('../test-utils/collect-request-body');
const paths = require('./paths');
const constants = require('./constants');
const nodemonConfig = require('../nodemon');

describe('test end to end', async () => {
  const COMMON_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36';
  const port = 9832;
  const hostname = '127.0.0.1';
  const baseUrl = 'http://' + hostname + ':' + port;
  const collectUrl = baseUrl + paths.COLLECT;
  const collectUrlDebug = collectUrl + '?debug=1';

  const ingressPort = 9820;
  const ingressUrl = 'http://localhost:' + ingressPort + "/ingresses.json";

  let amplitudeProxyServer;
  let ingressesServer;
  before(async () => {
    Object.keys(nodemonConfig.env).forEach(key => {
      process.env[key] = nodemonConfig.env[key];
    });
    process.env.INGRESSES_URL = ingressUrl;
    randomizeIngressPath();
    ingressesServer = await startMockDataServer(ingressPort);
    try {
      amplitudeProxyServer = await server();
      await amplitudeProxyServer.listen(port);
    } catch (e) {
      console.error('FATAL ERROR: ' + e.message);
      await ingressesServer.close();
      process.exit(1);
    }
  });

  after(async () => {
    await amplitudeProxyServer.close();
    await ingressesServer.close();
  });

  it('should block bot traffic', async () => {
    const result = await axios.post(
        collectUrlDebug,
        collectRequestBody([generateTestEvent()]),
        collectRequestHeader(),
    );
    assert.strictEqual(result.data, constants.IGNORED);
    assert.strictEqual(result.status, 200);
  });

  it('should receive and forward example event to amplitude', async () => {
    const result = await axios.post(
        collectUrlDebug,
        collectRequestBody([generateTestEvent()]),
        collectRequestHeader(COMMON_USER_AGENT),
    );
    if (result.data.code !== 200) {
      console.error(result.data);
    }
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.code, 200);
    assert.strictEqual(result.data.events_ingested, 1);
  });

  it('server should be ready when ready', async () => {
    const result1 = await axios.get(baseUrl + paths.ITS_ALIVE);
    assert.strictEqual(result1.status, 200);
    const result2 = await axios.get(baseUrl + paths.ITS_READY);
    assert.strictEqual(result2.status, 200);
  });

  it('should serve liberaries', async () => {
    const SDK_URL = baseUrl + paths.JS_SDK
    const result1 = await axios.get(SDK_URL);
    assert.strictEqual(result1.status, 200);
    const found1 = result1.data.indexOf(hostname + ':' + port + paths.COLLECT);
    assert.notStrictEqual(found1, -1);

    // Should be fetched same way second time
    const result2 = await axios.get(SDK_URL);
    assert.strictEqual(result2.status, 200);
    const found2 = result2.data.indexOf(hostname + ':' + port + paths.COLLECT);
    assert.notStrictEqual(found2, -1);
    assert.deepEqual(result1.data, result2.data);
  });
});

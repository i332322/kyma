const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // curl -k
});
axios.defaults.httpsAgent = httpsAgent;
const {
  appName,
  scenarioName,
  testNamespace,
  mockNamespace,
  kymaVersion,
  isSKR,
  testCompassFlow,
  testSubscriptionV1Alpha2,
  subCRDVersion,
  skrInstanceId,
  backendK8sSecretName,
  backendK8sSecretNamespace,
  testDataConfigMapName,
  eventingNatsSvcName,
  eventingNatsApiRuleAName,
  getJetStreamStreamData,
  timeoutTime,
  slowTime,
  gardener,
  director,
  shootName,
  cleanupTestingResources,
  eventingSinkName,
  getClusterHost,
  checkFunctionReachable,
  deployEventingSinkFunction,
  waitForEventingSinkFunction,
  deployV1Alpha1Subscriptions,
  deployV1Alpha2Subscriptions,
} = require('./utils');
const {
  eventMeshSecretFilePath,
  kymaSystem,
} = require('./common/common');
const {
  ensureCommerceMockLocalTestFixture,
  setEventMeshSourceNamespace,
  ensureCommerceMockWithCompassTestFixture,
} = require('../test/fixtures/commerce-mock');
const {
  info,
  error,
  debug,
  createEventingBackendK8sSecret,
  createK8sConfigMap,
  createApiRuleForService,
  deleteApiRule,
} = require('../utils');
const {
  addScenarioInCompass,
  assignRuntimeToScenario,
  scenarioExistsInCompass,
  isRuntimeAssignedToScenario,
} = require('../compass');
const {expect} = require('chai');

describe('Eventing tests preparation', function() {
  let natsApiRuleVSHost;

  this.timeout(timeoutTime);
  this.slow(slowTime);

  before(async () => {
    debug('expose the eventing-nats service with an apirule');
    const vs = await createApiRuleForService(eventingNatsApiRuleAName,
        kymaSystem,
        eventingNatsSvcName,
        8222);
    natsApiRuleVSHost = vs.spec.hosts[0];
  });

  it('Print test initial configs', async function() {
    debug(`Mock namespace: ${mockNamespace}`);
    debug(`Test namespace: ${testNamespace}`);
    debug(`Kyma version: ${kymaVersion}`);
    debug(`Is SKR cluster: ${isSKR}`);
    debug(`SKR instance Id: ${skrInstanceId}`);
    debug(`SKR shoot name: ${shootName}`);
    debug(`Test Compass flow enabled: ${testCompassFlow}`);
    debug(`Test Subscription v1alpha2 CRD enabled: ${testSubscriptionV1Alpha2}`);
    debug(`Test Subscription CRD version: ${subCRDVersion}`);
  });

  it('Prepare SKR Kubeconfig if needed', async function() {
    // Skip this step if it is not a SKR cluster
    if (!isSKR) {
      this.skip();
    }

    if (!skrInstanceId) {
      info(`Skipping fetching SKR kubeconfig because skrInstanceId is not set.`);
      this.skip();
    }

    // 'skr-test/helpers' initializes KEB clients on import, that is why it is imported only if needed
    const {getSKRConfig} = require('../skr-test/helpers');
    const {initK8sConfig} = require('../skr-test/helpers');

    debug(`Fetching SKR config for Instance Id: ${skrInstanceId}`);
    const shoot = await getSKRConfig(skrInstanceId);

    debug('Initiating SKR K8s config...');
    await initK8sConfig(shoot);
  });

  it('Prepare EventMesh secret', async function() {
    // If eventMeshSecretFilePath is specified then create a k8s secret for eventing-backend
    // else skip this step and use existing k8s secret as specified in backendK8sSecretName & backendK8sSecretNamespace
    if (!eventMeshSecretFilePath) {
      this.skip();
    }

    debug('Creating Event Mesh secret');
    const eventMeshInfo = await createEventingBackendK8sSecret(
        eventMeshSecretFilePath,
        backendK8sSecretName,
        backendK8sSecretNamespace,
    );
    setEventMeshSourceNamespace(eventMeshInfo['namespace']);
  });

  it('Prepare JetStream data configmap', async function() {
    // Create a configmap that contains stream data for jetstream so that during the test,
    // we can verify that the stream was not affected/recreated
    debug('Creating eventing test data configmap with JetStream stream info');
    const streamInfo = await getJetStreamStreamData(natsApiRuleVSHost);
    if (streamInfo) {
      await createK8sConfigMap(
          streamInfo,
          testDataConfigMapName,
      );
    } else {
      debug('Skipping creating eventing test data configmap due to missing stream');
    }
  });

  it('Prepare assets without Compass flow', async function() {
    // Skip this step if compass flow is enabled
    if (testCompassFlow) {
      this.skip();
    }

    // Deploy Commerce mock application, function and subscriptions for tests
    await prepareAssetsWithoutCompassFlow();
  });

  it('Prepare assets with Compass flow', async function() {
    // Skip this step if compass flow is disabled
    if (!testCompassFlow) {
      this.skip();
    }

    // Deploy Commerce mock application, function and subscriptions for tests (includes compass flow)
    await prepareAssetsWithCompassFlow();
  });

  it('Prepare eventing-sink function', async function() {
    debug('Preparing EventingSinkFunction');
    await deployEventingSinkFunction();
    await waitForEventingSinkFunction();
  });

  it('Eventing-sink function should be reachable through API Rule', async function() {
    this.test.retries(5);

    const host = await getClusterHost(eventingSinkName, testNamespace);
    expect(host).to.not.empty;
    debug('host fetched, now checking if eventing-sink function is reachable...');
    await checkFunctionReachable(eventingSinkName, testNamespace, host);
  });

  it('Prepare v1alpha1 subscriptions', async function() {
    await deployV1Alpha1Subscriptions();
  });

  it('Prepare v1alpha2 subscriptions', async function() {
    if (!testSubscriptionV1Alpha2) {
      this.skip();
    }
    await deployV1Alpha2Subscriptions();
  });

  afterEach(async function() {
    // if the test preparation failed, perform the cleanup
    if (this.currentTest.state === 'failed') {
      await cleanupTestingResources();
    }
  });

  after(async () => {
    await deleteApiRule(eventingNatsApiRuleAName, kymaSystem);
  });

  // // **** Helper functions ****
  // prepareAssetsWithoutCompassFlow - Sets up test assets without compass flow
  async function prepareAssetsWithoutCompassFlow() {
    debug('Preparing CommerceMock/In-cluster test fixtures on Kyma');
    await ensureCommerceMockLocalTestFixture(mockNamespace, testNamespace, testSubscriptionV1Alpha2).catch((err) => {
      error(err); // first error is logged
      return ensureCommerceMockLocalTestFixture(mockNamespace, testNamespace, testSubscriptionV1Alpha2);
    });
  }

  // prepareAssetsWithCompassFlow - Sets up test assets with compass flow
  async function prepareAssetsWithCompassFlow() {
    debug('Preparing CommerceMock/In-cluster test fixtures with compass flow on SKR');

    const skrInfo = await gardener.getShoot(shootName);

    debug(
        `appName: ${appName},
         scenarioName: ${scenarioName},
         testNamespace: ${testNamespace},
         compassID: ${skrInfo.compassID}`,
    );

    // check if compass scenario setup is needed
    const compassScenarioAlreadyExist = await scenarioExistsInCompass(director, scenarioName);
    if (compassScenarioAlreadyExist) {
      debug(`Compass scenario with the name ${scenarioName} already exist, do not register it again`);
    } else {
      debug('Assigning SKR to scenario in Compass');
      // Create a new scenario (systems/formations) in compass for this test
      await addScenarioInCompass(director, scenarioName);
    }

    // check if assigning the runtime to the scenario is needed
    const runtimeAssignedToScenario = await isRuntimeAssignedToScenario(director, skrInfo.compassID, scenarioName);
    if (!runtimeAssignedToScenario) {
      debug('Assigning Runtime to a compass scenario');
      // map scenario to target SKR
      await assignRuntimeToScenario(director, skrInfo.compassID, scenarioName);
    }

    await ensureCommerceMockWithCompassTestFixture(
        director,
        appName,
        scenarioName,
        mockNamespace,
        testNamespace,
        compassScenarioAlreadyExist,
    );
  }
});

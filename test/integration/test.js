const { expect } = require('chai');
const amqp = require('amqplib');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { Docker } = require('node-docker-api');

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock' });
const sleep = util.promisify(setTimeout);
const lazyApp = require('./app');

let connection;
let channel;

let feathersApp;
let application;
let disconnectApp;

const exchangeName = 'dummy-server';
const expectedMessage = 'a message';

const CONTAINER_NAME = 'integration_rabbitmq-feathers-amqp-client_1';
const AMQP_PORT = 55672;
const CONTAINER_STARTUP_TIME_SECONDS = 30;

async function connectToBroker() {
  connection = await amqp.connect(`amqp://localhost:${AMQP_PORT}`);
  channel = await connection.createChannel();
  channel.assertExchange(exchangeName, 'fanout', { durable: false });
}

async function getBrokerContainer() {
  const list = await docker.container.list();
  return list.filter((container) => container.data.Names.includes(`/${CONTAINER_NAME}`))[0];
}

describe('A feathers app', function () {
  this.timeout(120000);

  before('Start the broker', async () => {
    exec('docker-compose -f ./test/integration/docker-compose.yml up -d');
    console.log(`Waiting ${CONTAINER_STARTUP_TIME_SECONDS}s for rabbit to start`);
    await sleep(CONTAINER_STARTUP_TIME_SECONDS * 1000);

    await getBrokerContainer();
  });

  before('Setup AMQP channel', connectToBroker);

  after('Close AMQP channel', async () => {
    try {
      await channel.close();
      return connection.close();
    } catch (error) {
      // ignore error here in case the channel has already been closed by the server
      return null;
    }
  });

  after('Stop the broker', () => exec('docker-compose -f ./test/integration/docker-compose.yml down'));

  before('Start the app', () => {
    const { app, serviceReady, disconnect } = lazyApp();
    disconnectApp = disconnect;
    feathersApp = app;
    application = app.listen(4040);
    return serviceReady;
  });

  after('Close the app', async () => {
    await disconnectApp();
    application.close();
  });

  afterEach("Clear the app's received messages", () => {
    feathersApp.service('receiver').store = {};
  });

  it('should respond to messages from an AMQP broker', async () => {
    await channel.publish(exchangeName, '', Buffer.from(JSON.stringify({ data: { value: expectedMessage } })));

    await sleep(3000);

    const result = await feathersApp.service('receiver').find();

    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.have.property('value', expectedMessage);
  });

  it('should recover from the AMQP broker going down', async () => {
    const brokerContainer = await getBrokerContainer();

    // bounce the broker
    console.log('Bouncing the broker');
    await brokerContainer.stop();
    await brokerContainer.restart();

    // give the broker some time to restart
    console.log('Waiting for the broker to restart');
    await sleep(CONTAINER_STARTUP_TIME_SECONDS * 1000);

    // reconnect the publisher to the broker, leaving the consumer to reconnect itself
    // the consumer misses messages that were sent while it was down
    console.log('Reconnecting to the broker');
    await connectToBroker();

    console.log('Sending a message');
    await channel.publish(exchangeName, '', Buffer.from(JSON.stringify({ data: { value: expectedMessage } })));

    console.log('Wait for the message to be received');
    await sleep(3000);

    console.log('Checking if the message was received');
    const result = await feathersApp.service('receiver').find();

    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.have.property('value', expectedMessage);
  });
});

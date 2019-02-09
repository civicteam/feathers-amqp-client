const { expect } = require('chai');
const amqp = require('amqplib');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const sleep = util.promisify(setTimeout);
const lazyApp = require('./app');

let connection;
let channel;

let feathersApp;
let application;
let disconnectApp;

const exchangeName = 'dummy-server';

describe('A feathers app', function() {
  this.timeout(60000);

  before('Start the broker', async () => {
    exec('docker-compose -f ./test/integration/docker-compose.yml up -d');
    console.log('Waiting 15s for rabbit to start');
    await sleep(15000);
  });

  after('Stop the broker', () => exec('docker-compose -f ./test/integration/docker-compose.yml down'));

  before('Setup AMQP channel', async () => {
    connection = await amqp.connect('amqp://localhost');
    channel = await connection.createChannel();
    channel.assertExchange(exchangeName, 'fanout', { durable: false });
  });

  after('Close AMQP channel', async () => {
    try {
      await channel.close();
      return connection.close();
    } catch (error) {
      // ignore error here in case the channel has already been closed by the server
      return null;
    }
  });

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

  it('should respond to messages from an AMQP broker', async () => {
    const expectedMessage = 'a message';

    await channel.publish(exchangeName, '', Buffer.from(JSON.stringify({ data: { value: expectedMessage } })));

    await sleep(3000);

    const result = await feathersApp.service('receiver').find();

    expect(result).to.have.lengthOf(1);
    expect(result[0]).to.have.property('value', expectedMessage);
  });
});

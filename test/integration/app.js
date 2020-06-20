const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');

const createService = require('feathers-memory');
const { bindStream, disconnect } = require('../../index');

const AMQP_PORT = 55672;

function lazyApp() {
  const app = express(feathers());

  let serviceReady;

  app.configure(async function () {
    app.use('/receiver', createService({}));

    const service = app.service('receiver');

    serviceReady = bindStream(service.create.bind(service), {
      server: `amqp://localhost:${AMQP_PORT}`,
      exchange: { name: 'dummy-server' },
      queue: { name: 'my-task-queue' },
    });

    return serviceReady;
  });

  return {
    app,
    serviceReady,
    disconnect,
  };
}

module.exports = lazyApp;

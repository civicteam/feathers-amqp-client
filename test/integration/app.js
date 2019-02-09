const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');

const createService = require('feathers-memory');
const { bindStream, disconnect } = require('../../index');

function lazyApp() {
  const app = express(feathers());

  let serviceReady;

  app.configure(async function() {
    app.use('/receiver', createService({}));

    const service = app.service('receiver');

    serviceReady = bindStream(service.create.bind(service), {
      exchange: { name: 'dummy-server' },
      queue: { name: 'my-task-queue' }
    });

    return serviceReady;
  });

  return {
    app,
    serviceReady,
    disconnect
  };
}

module.exports = lazyApp;

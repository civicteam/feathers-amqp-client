# Feathers AMQP Client

## Introduction

This library allows a feathers.js app to receive messages from an
AMQP 0.8 broker (e.g. RabbitMQ). A service function can be associated with a
queue, so that messages pushed on the queue will be passed to this feathers service.

Its main use case is a 'job-queue' model, where one or many event producers publish events,
and multiple consumers consume these events, but each event must go to only one consumer.

This is different to [feathers sync](https://github.com/feathersjs-ecosystem/feathers-sync),
which sends all events to all clients, so that they can synchronise their internal state.

## How to use

receiver.service.js

    const { bindStream } = require('feathers-amqp-client');
    const createService = require('feathers-memory');
    
    module.exports = function (app) {
        app.use('/posts', createService({}));
        const service = app.service('posts');
    
        bindStream(service.create.bind(service), {
          exchange: { name: 'my-exchange'},
          queue: { name: 'my-task-queue' }
        });
    }

The above example creates a simple in-memory resource, 'posts', and connects it to
the task queue, 'my-task-queue'. The task queue will be configured to draw messages from
the 'my-exchange' exchange. Neither the queue, nor the exchange, need exist beforehand.

`service.create.bind(service)` is necessary, as feathers services require access to
the `this` context.

### Message Format and Manipulation

feathers-amqp-client expects messages in the following form: 

    { data: {...}}
    
In other words, an object with a `data` property. This data property will be passed
directly into bound service function. To manipulate the data before passing it to the
service, you can do something like this:

    bindStream(data => {
        const dataForService = /* do something to the data */
        return service.create(dataForService)
    }), {
        exchange: { name: 'my-exchange'},
        queue: { name: 'my-task-queue' }
    });

## Development and Testing

To run the tests locally:

    npm install
    npm test
    
Note - for the integration tests you must have docker installed.
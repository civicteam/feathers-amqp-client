const amqp = require('amqplib');
const exitHook = require('async-exit-hook');

let connection;
const disconnectTasks = [];

async function bindStream(fn, config) {
  function consume(message) {
    const content = JSON.parse(message.content);

    fn(content.data);
  }

  // reuse an existing connection if present
  if (!connection) {
    connection = await amqp.connect(config.server || 'amqp://localhost');
  }

  const channel = await connection.createChannel();

  channel.assertExchange(config.exchange.name, config.exchange.type || 'fanout', { durable: config.durable || false });

  const queue = await channel.assertQueue(config.queue.name, { exclusive: config.queue.exclusive || false });

  console.log('Binding queue %s with exchange %s', config.queue.name, config.exchange.name);
  await channel.bindQueue(queue.queue, config.exchange.name);

  const close = async () => {
    console.log('Disconnecting from AMQP server...');
    try {
      await channel.close();
      return connection.close();
    } catch (error) {
      // ignore errors here in case the connection has already been closed
      return null;
    }
  };
  exitHook(close);
  disconnectTasks.push(close);

  console.log('Waiting for messages in %s.', config.queue.name);
  return channel.consume(queue.queue, message => consume(message), { noAck: true });
}

function disconnect() {
  return Promise.all(disconnectTasks.map(fn => fn()));
}

module.exports = {
  bindStream,
  disconnect
};

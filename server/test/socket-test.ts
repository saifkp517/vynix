import { io } from 'socket.io-client';

const socket = io('http://localhost:4000', {
  timeout: 5000,
});

const timeout = setTimeout(() => {
  console.error('Connection timeout');
  process.exit(1);
}, 5000);

socket.on('connect', () => {
  clearTimeout(timeout);

  console.log('connected');

  socket.emit('ping', {
    hello: 'world',
  });
});

socket.on('connect_error', (err) => {
  console.error('connect_error');
  console.error(err);

  process.exit(1);
});

socket.on('pong', (data) => {
  console.log('pong received');
  console.log(data);

  process.exit(0);
});
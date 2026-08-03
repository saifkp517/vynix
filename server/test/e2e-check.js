const { io } = require('socket.io-client');

function connect(name) {
  return new Promise((resolve, reject) => {
    const socket = io('http://localhost:4000', { timeout: 5000 });
    const t = setTimeout(() => reject(new Error(`${name} connect timeout`)), 5000);
    socket.on('connect', () => {
      clearTimeout(t);
      console.log(`[${name}] connected as ${socket.id}`);
      resolve(socket);
    });
    socket.on('connect_error', (e) => reject(e));
  });
}

async function main() {
  const a = await connect('A');
  const b = await connect('B');

  let aRoom, bRoom;
  const roomAssigned = new Promise((resolve) => {
    let count = 0;
    a.on('roomAssigned', (d) => { aRoom = d.roomId; console.log('[A] roomAssigned', d.roomId); if (++count === 2) resolve(); });
    b.on('roomAssigned', (d) => { bRoom = d.roomId; console.log('[B] roomAssigned', d.roomId); if (++count === 2) resolve(); });
  });

  a.on('playerJoined', (d) => console.log('[A] saw playerJoined', d.id));
  b.on('playerJoined', (d) => console.log('[B] saw playerJoined', d.id));
  a.on('spawnPoint', (p) => console.log('[A] spawnPoint', p));
  b.on('spawnPoint', (p) => console.log('[B] spawnPoint', p));

  a.emit('requestMatchmaking', 'PlayerA');
  b.emit('requestMatchmaking', 'PlayerB');

  await roomAssigned;

  if (aRoom !== bRoom) {
    console.error('FAIL: players not in same room', aRoom, bRoom);
    process.exit(1);
  }
  console.log('OK: both players matched into room', aRoom);

  // Movement test
  const moved = new Promise((resolve) => {
    b.on('playerMoved', (d) => { console.log('[B] saw playerMoved from', d.id, d.position); resolve(); });
  });
  a.emit('updatePositionAndCamera', {
    position: { x: 5, y: 0, z: 5 },
    velocity: { x: 0, y: 0, z: 0 },
    cameraDirection: { x: 0, y: 0, z: 1 },
    roomId: aRoom,
  });
  await Promise.race([moved, new Promise((_, rej) => setTimeout(() => rej(new Error('movement timeout')), 5000))]);
  console.log('OK: movement broadcast works');

  // Combat test: A shoots at B's position
  const hitOrShot = new Promise((resolve) => {
    let seen = false;
    a.on('playerShot', () => { seen = true; });
    b.on('hit', () => { console.log('[B] got hit event'); resolve('hit'); });
    setTimeout(() => resolve(seen ? 'shot-only' : 'none'), 3000);
  });
  a.emit('shoot', {
    userId: a.id,
    roomId: aRoom,
    shootObject: {
      rayOrigin: { x: 5, y: 1.5, z: 5 },
      rayDirection: { x: 0, y: 0, z: 1 },
    },
  });
  const combatResult = await hitOrShot;
  console.log('Combat result:', combatResult);

  console.log('ALL CHECKS DONE');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

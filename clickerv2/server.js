const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// In-memory map: name -> { ws, lastActive, password }
const clients = new Map();

function broadcastPresence() {
  const list = [];
  const now = Date.now();
  for (const [name, info] of clients.entries()) {
    list.push({ name, lastActive: info.lastActive, status: info.status || 'online' });
  }
  const payload = JSON.stringify({ type: 'presenceList', list });
  for (const [, info] of clients.entries()) {
    try { info.ws.send(payload); } catch (e) {}
  }
}

wss.on('connection', function connection(ws) {
  let authName = null;

  ws.on('message', function incoming(msg) {
    let data = null;
    try { data = JSON.parse(msg); } catch (e) { return; }

    if (data.type === 'auth') {
      authName = data.name || ('guest_' + Math.floor(Math.random()*10000));
      const entry = { ws, lastActive: Date.now(), status: 'online', password: data.password || '' };
      clients.set(authName, entry);
      broadcastPresence();
      return;
    }

    if (!authName) return;

    const entry = clients.get(authName);
    if (!entry) return;

    if (data.type === 'presence') {
      entry.lastActive = Date.now();
      entry.status = data.status || 'online';
      broadcastPresence();
    }

    if (data.type === 'activity') {
      entry.lastActive = Date.now();
      entry.status = data.activity || 'active';
      // Broadcast a lightweight activity message
      const payload = JSON.stringify({ type: 'activity', from: authName, activity: data.activity, ts: entry.lastActive });
      for (const [, info] of clients.entries()) {
        try { info.ws.send(payload); } catch (e) {}
      }
    }
  });

  ws.on('close', function() {
    if (authName) {
      clients.delete(authName);
      broadcastPresence();
    }
  });
});

// Prune inactive connections every 15s
setInterval(() => {
  const now = Date.now();
  for (const [name, info] of clients.entries()) {
    if (now - info.lastActive > 30000) { // 30s inactivity
      try { info.ws.terminate(); } catch (e) {}
      clients.delete(name);
    }
  }
  broadcastPresence();
}, 15000);

console.log('WebSocket presence server running on ws://localhost:8080');

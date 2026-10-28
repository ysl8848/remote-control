import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const code = () => String(Math.floor(100000 + Math.random() * 900000));
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') { res.writeHead(200, {'content-type':'application/json'}); return res.end('{"ok":true}'); }
  try { const body = await readFile(new URL('./connect.html', import.meta.url)); res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  let room;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'create') {
      room = code(); while (rooms.has(room)) room = code();
      rooms.set(room, {host: ws}); ws.send(JSON.stringify({type:'created', room})); return;
    }
    if (msg.type === 'join' && /^[0-9]{6}$/.test(msg.room)) {
      const r = rooms.get(msg.room); if (!r || r.guest) return ws.send(JSON.stringify({type:'error', message:'连接码无效或已使用'}));
      room = msg.room; r.guest = ws; r.host.send(JSON.stringify({type:'request'})); ws.send(JSON.stringify({type:'waiting'})); return;
    }
    const r = rooms.get(room); if (!r) return;
    if (msg.type === 'approve' || msg.type === 'reject') {
      if (r.guest) r.guest.send(JSON.stringify(msg)); if (msg.type === 'reject') rooms.delete(room); return;
    }
    if (['offer','answer','ice','stop'].includes(msg.type)) {
      const other = ws === r.host ? r.guest : r.host; if (other) other.send(JSON.stringify(msg));
    }
  });
  ws.on('close', () => { if (room && rooms.has(room)) { const r=rooms.get(room); const other=ws===r.host?r.guest:r.host; if(other) other.send(JSON.stringify({type:'stop'})); rooms.delete(room); } });
});
server.listen(port, () => console.log(`Remote support signaling server: http://localhost:${port}`));

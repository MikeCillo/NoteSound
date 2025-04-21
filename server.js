const http = require('http');
const fs = require('fs');
const path = require('path');
// const mdns = require('mdns');    // Commentato per Railway
// const bonjour = require('bonjour')(); // Commentato per Railway
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;  // Usato per Railway
const PUBLIC_DIR = path.join(__dirname, 'public'); // Cambiato a 'public'

const server = http.createServer((req, res) => {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

  console.log('🗂️ Richiesta file:', filePath); // Ti dice dove sta cercando i file

  const extname = path.extname(filePath);
  const contentTypeMap = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.wav': 'audio/wav',
  };

  const contentType = contentTypeMap[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('File non trovato');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Interfaccia web disponibile su https://notesound.up.railway.app`); // URL pubblico di Railway
  // mDNS non è necessario su Railway, quindi questa parte è stata rimossa:
  // console.log(`🌍 oppure via mDNS su http://music.local:${PORT}`);
});

// Le seguenti righe sono commentate perché non funzionano su Railway
// try {
//   const ad = mdns.createAdvertisement(mdns.tcp('http'), PORT, { name: 'music' });
//   ad.start();
// } catch (err) {
//   console.warn('⚠️ mDNS non disponibile:', err.message);
// }

// Configurazione WebSocket
// Sostituisci localhost con l'URL pubblico di Railway per l'host WebSocket
const wssBeat = new WebSocket.Server({ port: 8001, host: '0.0.0.0', path: '/beat' });
const wssNote = new WebSocket.Server({ port: 8002, host: '0.0.0.0', path: '/note' });

console.log(`✅ WebSocket server attivo su ws://notesound.up.railway.app:8001 per /beat`);
console.log(`✅ WebSocket server attivo su ws://notesound.up.railway.app:8002 per /note`);

// Le seguenti righe sono commentate per Railway (mDNS non disponibile)
//
// bonjour.publish({ name: 'music-beat', type: 'http', port: 8001, host: 'music.local' });
// bonjour.publish({ name: 'music-note', type: 'http', port: 8002, host: 'music.local' });
// bonjour.publish({ name: 'music-bpm', type: 'http', port: 8003, host: 'music.local' });
//
// console.log('🌍 mDNS pubblicato come music.local per /beat, /note e /bpm');
// console.log('🔗 Accessibile da altri dispositivi in rete come:');
// console.log('   👉 ws://music.local:8001/beat');
// console.log('   👉 ws://music.local:8002/note');
// console.log('   👉 ws://music.local:8003/bpm');

// === Logica per gestire le informazioni sui beat ===

let BPM = 120; // Impostazione iniziale del BPM
let beatCount = 0;

// Funzione per inviare informazioni sul beat
const sendBeat = (isFirstBeat) => {
  const beatPayload = JSON.stringify({ isFirstBeat });

  // Invia i messaggi a tutti i client connessi su /beat
  wssBeat.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(beatPayload);
    }
  });

  console.log(`⏱️ Sent BEAT (${isFirstBeat ? 'PRIMO' : 'normale'})`);
  beatCount++;
};

// Ascolta i messaggi dei client per inviare i beat
wssBeat.on('connection', (ws) => {
  console.log('🎧 Connessione su /beat');
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());  // Parsea il messaggio ricevuto come JSON
    console.log('📡 Messaggio ricevuto su /beat:', message);

    // Controlla se il messaggio contiene un campo bpm
    if (message.bpm) {
      console.log('🎶🎶🎶🎶 BPM ricevuto:', message.bpm);  // Stampa il BPM nel log
    }

    // Inoltra il messaggio ricevuto a tutti i client connessi su /beat
    wssBeat.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data.toString());  // Invia il messaggio a tutti i client
      }
    });
  });  
});

// Ascolta i messaggi dei client per inoltrare note o altri messaggi
wssNote.on('connection', (ws) => {
  console.log('🎧 Connessione su /note');
  
  // Log per confermare che un client si è connesso
  ws.on('message', (data) => {
    console.log('📡 Messaggio ricevuto su /note:', data.toString());

    // Inoltra il messaggio a tutti i client connessi su /note
    wssNote.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data.toString());
      }
    });
  });
});

// ── proxy.js ─────────────────────────────────────────────────────────────────
// Local CORS proxy — forwards requests to Groq API.
// Required because browsers block direct API calls from localhost.
//
// Usage: node proxy.js
// Runs on: http://localhost:8010
// ─────────────────────────────────────────────────────────────────────────────

const http  = require('http');
const https = require('https');

http.createServer((req, res) => {
  // Allow all CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Collect request body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers['authorization'],
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const proxy = https.request(options, r => {
      res.writeHead(r.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      r.pipe(res);
    });

    proxy.on('error', e => {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    });

    proxy.write(body);
    proxy.end();
  });

}).listen(8010, () => {
  console.log('');
  console.log('  🔀 Groq proxy running on http://localhost:8010');
  console.log('  Forwarding → api.groq.com/openai/v1/chat/completions');
  console.log('');
});

// Healthcare patient-records API (secure coding demo, Step 3)
'use strict';
const http = require('http');
const crypto = require('crypto');

// No hardcoded secrets: everything sensitive comes from environment variables (K8s Secret)
const API_TOKEN = process.env.API_TOKEN;
const ADMIN_PASSWORD = process.env.DB_PASSWORD;
if (!API_TOKEN || !ADMIN_PASSWORD) {
  console.error('Missing API_TOKEN or DB_PASSWORD environment variable - refusing to start');
  process.exit(1);
}
const PORT = Number(process.env.PORT || 3000);

const patients = [];
const metrics = { requests: 0, unauthorized: 0, failedLogins: 0, validationErrors: 0 };

// Input validation rules
const NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,59}$/;
const MRN_RE = /^MRN-\d{6}$/;
const ALLOWED_BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
function validatePatient(p) {
  const errors = [];
  if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) errors.push('name');
  if (!Number.isInteger(p.age) || p.age < 0 || p.age > 130) errors.push('age');
  if (typeof p.mrn !== 'string' || !MRN_RE.test(p.mrn)) errors.push('mrn');
  if (!ALLOWED_BLOOD.includes(p.bloodGroup)) errors.push('bloodGroup');
  return errors;
}

// Constant-time comparison to avoid timing attacks
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// PHI is masked before it is ever returned in lists or logs
const mask = (s) => s.slice(0, 1) + '***';

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
function send(res, code, body) {
  res.writeHead(code, SECURITY_HEADERS);
  res.end(JSON.stringify(body));
}

function readJson(req, cb) {
  let data = '';
  req.on('data', (c) => {
    data += c;
    if (data.length > 10000) req.destroy(); // reject oversized bodies
  });
  req.on('end', () => {
    try { cb(null, JSON.parse(data || '{}')); } catch (e) { cb(e); }
  });
}

const authorized = (req) => safeEqual(req.headers.authorization || '', 'Bearer ' + API_TOKEN);

const server = http.createServer((req, res) => {
  metrics.requests++;
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/health') return send(res, 200, { status: 'ok' });

  if (req.method === 'GET' && url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4', 'X-Content-Type-Options': 'nosniff' });
    return res.end(
      `healthcare_http_requests_total ${metrics.requests}\n` +
      `healthcare_unauthorized_access_total ${metrics.unauthorized}\n` +
      `healthcare_failed_logins_total ${metrics.failedLogins}\n` +
      `healthcare_validation_errors_total ${metrics.validationErrors}\n` +
      `healthcare_patients_total ${patients.length}\n`
    );
  }

  if (req.method === 'POST' && url === '/login') {
    return readJson(req, (err, body) => {
      if (err || !safeEqual(body.password, ADMIN_PASSWORD)) {
        metrics.failedLogins++;
        console.warn('Failed login attempt');
        return send(res, 401, { error: 'invalid credentials' });
      }
      return send(res, 200, { token: API_TOKEN });
    });
  }

  if (url === '/patients') {
    if (!authorized(req)) {
      metrics.unauthorized++;
      console.warn('Unauthorized access to /patients');
      return send(res, 401, { error: 'unauthorized' });
    }
    if (req.method === 'GET') {
      return send(res, 200, patients.map((p) => ({ id: p.id, name: mask(p.name), age: p.age })));
    }
    if (req.method === 'POST') {
      return readJson(req, (err, body) => {
        const errors = err ? ['body'] : validatePatient(body);
        if (errors.length) {
          metrics.validationErrors++;
          return send(res, 400, { error: 'validation failed', fields: errors });
        }
        const p = { id: crypto.randomUUID(), name: body.name, age: body.age, mrn: body.mrn, bloodGroup: body.bloodGroup };
        patients.push(p);
        console.info('Patient created', p.id);
        return send(res, 201, { id: p.id });
      });
    }
  }

  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.info(`healthcare-app listening on ${PORT}`));

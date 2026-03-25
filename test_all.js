import fs from 'fs';

async function testAll() {
  const routes = [
    { p: '/api/status', m: 'GET' },
    { p: '/api/green', m: 'GET' },
    { p: '/api/health', m: 'GET' },
    { p: '/api/user/profile', m: 'GET' },
    { p: '/api/metrics', m: 'GET' },
    { p: '/api/runs', m: 'GET' },
    { p: '/api/settings', m: 'GET' },
    { p: '/api/user/connect', m: 'POST' },
    { p: '/webhook', m: 'POST' },
    { p: '/auth/login', m: 'POST' },
    { p: '/auth/signup', m: 'POST' },
    { p: '/login', m: 'GET' },
    { p: '/dashboard', m: 'GET' },
    { p: '/signup', m: 'GET' },
    { p: '/setup', m: 'GET' }
  ];
  
  let out = '';
  for (const r of routes) {
    try {
      const res = await fetch('https://api-urtl66e5lq-uc.a.run.app' + r.p, { method: r.m });
      const text = await res.text();
      out += `${r.m} ${r.p}: ${res.status} ${text.slice(0, 100).replace(/\n/g, '')}\n`;
    } catch(e) { out += `ERR ${r.p}: ${e.message}\n`; }
  }
  fs.writeFileSync('test_results.txt', out);
}
testAll();

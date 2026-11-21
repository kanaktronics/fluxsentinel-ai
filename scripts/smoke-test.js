// Hits every route once and prints the status code.
// Usage: node scripts/smoke-test.js [base-url]   (default http://localhost:3000)
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

const routes = [
  ['GET', '/api/status'], ['GET', '/api/green'], ['GET', '/api/health'],
  ['GET', '/api/user/profile'], ['GET', '/api/metrics'], ['GET', '/api/runs'],
  ['GET', '/api/settings'], ['POST', '/api/user/connect'], ['POST', '/webhook'],
  ['POST', '/auth/login'], ['POST', '/auth/signup'],
  ['GET', '/login'], ['GET', '/dashboard'], ['GET', '/signup'], ['GET', '/setup'],
];

for (const [method, path] of routes) {
  try {
    const res = await fetch(BASE + path, { method });
    console.log(`${method.padEnd(4)} ${path.padEnd(20)} ${res.status}`);
  } catch (e) {
    console.log(`${method.padEnd(4)} ${path.padEnd(20)} ERR ${e.message}`);
  }
}

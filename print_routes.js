import app from './src/webhook.js';
import fs from 'fs';

let out = '';
app._router.stack.forEach((middleware) => {
  if (middleware.route) out += Object.keys(middleware.route.methods).join(', ').toUpperCase() + ' ' + middleware.route.path + '\n';
  else if (middleware.name === 'router') {
    middleware.handle.stack.forEach((handler) => {
      if (handler.route) out += Object.keys(handler.route.methods).join(', ').toUpperCase() + ' ' + handler.route.path + '\n';
    });
  }
});
fs.writeFileSync('routes_utf8.txt', out, 'utf8');
process.exit(0);

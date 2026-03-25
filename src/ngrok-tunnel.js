/**
 * src/ngrok-tunnel.js
 * Spawns the bundled ngrok.exe to expose the local server publicly.
 * Reads NGROK_AUTHTOKEN (required) and NGROK_DOMAIN (optional) from env.
 * Returns the public HTTPS URL once the tunnel is open.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './middleware/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NGROK_BIN = path.join(__dirname, '..', 'ngrok.exe');
const NGROK_API = 'http://localhost:4040/api/tunnels';

let _publicUrl = null;
let _ngrokProcess = null;

/**
 * Polls the ngrok local API until a tunnel URL is available.
 */
async function waitForTunnel(retries = 20, delayMs = 600) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(NGROK_API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const https = data.tunnels?.find(t => t.proto === 'https');
      if (https?.public_url) return https.public_url;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('ngrok tunnel did not open after 12 seconds');
}

/**
 * Starts ngrok and returns the public HTTPS URL.
 * Safe to call multiple times — won't spawn a second process.
 */
export async function startNgrok(port = 3000) {
  if (_publicUrl) return _publicUrl;

  if (process.env.NODE_ENV === 'production') {
    logger.info('[Network] Running in production mode. Skipping local ngrok tunnel.');
    _publicUrl = process.env.PUBLIC_URL || null;
    return _publicUrl;
  }

  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    logger.warn('NGROK_AUTHTOKEN not set — skipping ngrok tunnel.');
    return null;
  }

  const args = ['http', String(port), `--authtoken=${authtoken}`, '--log=stdout'];
  if (process.env.NGROK_DOMAIN) {
    args.push(`--domain=${process.env.NGROK_DOMAIN}`);
  }

  logger.info('Starting ngrok tunnel...');
  _ngrokProcess = spawn(NGROK_BIN, args, { stdio: 'pipe' });

  _ngrokProcess.stderr.on('data', d => logger.debug(`[ngrok] ${d.toString().trim()}`));
  _ngrokProcess.on('error', err => logger.error(`ngrok spawn error: ${err.message}`));
  _ngrokProcess.on('exit', code => {
    logger.warn(`ngrok exited with code ${code}`);
    _publicUrl = null;
  });

  _publicUrl = await waitForTunnel();
  return _publicUrl;
}

/** Returns the currently active public URL (or null). */
export function getPublicUrl() {
  if (process.env.NODE_ENV === 'production' && process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  return _publicUrl;
}

/**
 * middleware/logger.js
 * Winston logger setup with console (colorized dev) and file (JSON prod) transports.
 * Export a single shared logger instance used across all modules.
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

const { combine, timestamp, colorize, printf, json, errors } = winston.format;

// Console format for development
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: 'info', // hardcoded for demo — suppresses debug GitLab API call noise
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'app.log'),
    format: fileFormat,
    level: 'debug',
    maxsize: 10 * 1024 * 1024, // 10 MB
    maxFiles: 5,
    tailable: true,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    format: fileFormat,
    level: 'error',
    maxsize: 5 * 1024 * 1024,
    maxFiles: 3,
  }),
];

const logger = winston.createLogger({
  level: 'debug',
  transports,
  exitOnError: false,
});

export default logger;

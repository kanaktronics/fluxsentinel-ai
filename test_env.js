import 'dotenv/config';
console.log('Before:', process.env.NODE_ENV);
import { onRequest } from 'firebase-functions/v2/https';
console.log('After:', process.env.NODE_ENV);

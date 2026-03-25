/**
 * src/db.js
 * Initializes and exports the Firebase Admin SDK connection to Firestore.
 * Requires Google Application Default Credentials (ADC) to be present in the environment.
 */
import admin from 'firebase-admin';
import logger from './middleware/logger.js';

try {
  // Initialize with application default credentials (works locally via gcloud auth, and automatically on Cloud Run)
  // Hardcoded to the user's specific project ID: fluxsentinel-598aa
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'fluxsentinel-598aa'
  });
  logger.info('[Firebase] Admin SDK initialized successfully pointing to project: fluxsentinel-598aa');
} catch (error) {
  if (!/already exists/.test(error.message)) {
    logger.error(`[Firebase] Initialization Error: ${error.message}`);
  }
}

export const db = admin.firestore();

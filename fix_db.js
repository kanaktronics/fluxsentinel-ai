import { db } from './src/db.js';

async function fixRuns() {
  const snapshot = await db.collection('runs').where('userId', '==', 'anonymous').get();
  console.log(`Found ${snapshot.docs.length} orphaned runs. Fixing...`);
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { userId: 'env-admin' });
  });
  
  await batch.commit();
  console.log('Fixed!');
}

fixRuns().then(() => process.exit(0)).catch(e => console.error(e));

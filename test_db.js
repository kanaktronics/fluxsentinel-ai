import { db } from './src/db.js';

async function check() {
  const users = await db.collection('users').get();
  console.log('USERS:');
  users.docs.forEach(d => console.log(d.id, d.data()));

  const runs = await db.collection('runs').get();
  console.log('\nRUNS:');
  runs.docs.forEach(d => console.log(d.id, { userId: d.data().userId, status: d.data().status }));

  const active = await db.collection('runs_active').get();
  console.log('\nACTIVE RUNS:');
  active.docs.forEach(d => console.log(d.id, d.data()));
}

check().then(() => process.exit(0)).catch(e => console.error(e));

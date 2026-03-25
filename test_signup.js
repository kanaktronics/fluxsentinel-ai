async function testLive() {
  try {
    const res = await fetch('https://api-urtl66e5lq-uc.a.run.app/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test_user_live', password: 'password123', email: 'test@example.com' })
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${text}`);
  } catch(e) { console.error(e.message); }
}
testLive();

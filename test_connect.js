async function test() {
  try {
    const res = await fetch('https://api-urtl66e5lq-uc.a.run.app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' })
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${text}`);
  } catch(e) {
    console.error(e);
  }
}
test();

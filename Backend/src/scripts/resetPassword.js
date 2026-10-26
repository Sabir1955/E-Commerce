const bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function reset() {
  const hash = await bcrypt.hash('password123', 10);
  await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, 'sabirmmd000@gmail.com']);
  console.log('Customer password set to password123 successfully');
  await pool.end();
}

reset();

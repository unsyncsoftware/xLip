import bcrypt from 'bcrypt';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: 'xlip',
  host: '127.0.0.1',
  database: 'xlip_db',
  password: 'xlip_pass', // Use the password we set earlier
  port: 5432,
});

async function reset() {
    try {
        const newHash = await bcrypt.hash('RaceControl2026!', 10);
        await pool.query(
            "UPDATE users SET password_hash = $1, is_admin = true WHERE email = 'admin@xlip.uk'",
            [newHash]
        );
        console.log("✅ SUCCESS: Hash generated locally and saved to DB.");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR:", err);
        process.exit(1);
    }
}
reset();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'src', 'database', 'dispute-portal.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const admin = db.admin_users && db.admin_users[0];

(async () => {
  if (!admin) {
    console.log('No admin found');
    process.exit(0);
  }
  console.log('Admin email:', admin.email);
  console.log('Hash:', admin.password);
  const ok = await bcrypt.compare('Admin@SecurePass123', admin.password);
  console.log('Password matches expected?', ok);
})();
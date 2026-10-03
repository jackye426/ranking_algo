// Generates a dedicated read token locally; only its hash is deployed.
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const envPath = path.join(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) throw new Error('Refusing to overwrite an existing local environment.');
const token = randomBytes(32).toString('hex');
fs.writeFileSync(envPath, [
  'DEMO_DATA_SOURCE=supabase',
  'SUPABASE_URL=https://oewczjseteyvyvikxxaz.supabase.co',
  'SUPABASE_READER_FUNCTION=docmap-spire-demo-read',
  `SUPABASE_READER_TOKEN=${token}`,
  'HOST=127.0.0.1',
  'SERVER_PORT=3000', ''
].join('\n'), {mode:0o600});
console.log(JSON.stringify({tokenHash:createHash('sha256').update(token).digest('hex')}));

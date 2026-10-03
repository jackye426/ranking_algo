async function readSupabaseRows() {
  const base = process.env.SUPABASE_URL;
  const name = process.env.SUPABASE_READER_FUNCTION;
  const token = process.env.SUPABASE_READER_TOKEN;
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(base || '') || !/^[a-z0-9-]+$/.test(name || '') || !/^[a-f0-9]{64}$/.test(token || '')) {
    throw new Error('Supabase requires the project URL, restricted reader function and server-only read token in .env.local.');
  }
  const rows = []; const cursors = new Set(); let after = null;
  for (let page = 0; page < 30; page++) {
    const url = new URL(`${base.replace(/\/$/, '')}/functions/v1/${name}`);
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url, {headers:{'x-docmap-token':token,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
    if (!res.ok) throw new Error(`Supabase consultant read failed (${res.status}). No fallback dataset was substituted.`);
    const body = await res.json();
    if (!Array.isArray(body.rows) || body.rows.length > 500) throw new Error('Invalid Supabase consultant response.');
    rows.push(...body.rows);
    if (!body.next) return {rows, fetchedAt:body.fetchedAt};
    if (typeof body.next !== 'string' || cursors.has(body.next)) throw new Error('Invalid Supabase pagination cursor.');
    cursors.add(body.next); after = body.next;
  }
  throw new Error('Supabase row safety limit exceeded.');
}
module.exports = {readSupabaseRows};

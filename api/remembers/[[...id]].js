const { sql } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');
const { cors } = require('../_lib/cors');
const { getSegments } = require('../_lib/path-segments');

let schemaPromise = null;

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function normalizeOccasions(rawOccasions) {
  if (!Array.isArray(rawOccasions)) return [];

  return rawOccasions
    .map((occasion, index) => ({
      person_name: cleanText(occasion?.personName),
      occasion_type: cleanText(occasion?.occasionType),
      occasion_date: cleanText(occasion?.occasionDate),
      relevance: cleanText(occasion?.relevance),
      position: index,
    }))
    .filter((occasion) => (
      occasion.person_name ||
      occasion.occasion_type ||
      occasion.occasion_date ||
      occasion.relevance
    ));
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getNextOccurrence(dateValue, today = startOfTodayUtc()) {
  if (!isValidIsoDate(String(dateValue || ''))) return null;

  const source = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  let next = new Date(Date.UTC(
    today.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate()
  ));

  if (next < today) {
    next = new Date(Date.UTC(
      today.getUTCFullYear() + 1,
      source.getUTCMonth(),
      source.getUTCDate()
    ));
  }

  return next.toISOString().slice(0, 10);
}

function getDaysUntil(isoDate, today = startOfTodayUtc()) {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00Z`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function decorateOccasion(occasion, today = startOfTodayUtc()) {
  const nextOccurrence = getNextOccurrence(occasion.occasion_date, today);
  return {
    ...occasion,
    next_occurrence: nextOccurrence,
    days_until: getDaysUntil(nextOccurrence, today),
  };
}

function compareOccasions(a, b) {
  const left = Number.isFinite(a.days_until) ? a.days_until : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(b.days_until) ? b.days_until : Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.position - b.position;
}

function compareRegistrations(a, b) {
  const left = Number.isFinite(a.next_reminder?.days_until)
    ? a.next_reminder.days_until
    : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(b.next_reminder?.days_until)
    ? b.next_reminder.days_until
    : Number.MAX_SAFE_INTEGER;

  if (left !== right) return left - right;
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql.query(`
        CREATE TABLE IF NOT EXISTS remember_registrations (
          id SERIAL PRIMARY KEY,
          full_name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      await sql.query(`
        CREATE TABLE IF NOT EXISTS remember_occasions (
          id SERIAL PRIMARY KEY,
          registration_id INTEGER NOT NULL REFERENCES remember_registrations(id) ON DELETE CASCADE,
          person_name TEXT NOT NULL,
          occasion_type TEXT NOT NULL,
          occasion_date DATE NOT NULL,
          relevance TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0
        )
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

async function attachOccasions(registrations) {
  if (!registrations.length) return registrations;

  const ids = registrations.map((registration) => registration.id);
  const { rows: occasions } = await sql.query(
    `SELECT *
     FROM remember_occasions
     WHERE registration_id = ANY($1)
     ORDER BY position ASC, occasion_date ASC`,
    [ids]
  );

  const occasionsByRegistration = occasions.reduce((map, occasion) => {
    const list = map.get(occasion.registration_id) || [];
    list.push(occasion);
    map.set(occasion.registration_id, list);
    return map;
  }, new Map());

  return registrations
    .map((registration) => {
      const decoratedOccasions = (occasionsByRegistration.get(registration.id) || [])
        .map((occasion) => decorateOccasion(occasion))
        .sort(compareOccasions);

      return {
        ...registration,
        occasion_count: decoratedOccasions.length,
        occasions: decoratedOccasions,
        next_reminder: decoratedOccasions[0] || null,
      };
    })
    .sort(compareRegistrations);
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  await ensureSchema();

  const segments = getSegments(req, '/api/remembers');

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;

      const { rows } = await sql`
        SELECT *
        FROM remember_registrations
        ORDER BY updated_at DESC
      `;
      return res.status(200).json(await attachOccasions(rows));
    }

    if (req.method === 'POST') {
      const fullName = cleanText(req.body?.fullName);
      const email = normalizeEmail(req.body?.email);
      const phone = cleanText(req.body?.phone);
      const occasions = normalizeOccasions(req.body?.occasions);

      if (!fullName || !email || !phone) {
        return res.status(400).json({ error: 'Full name, email, and phone number are required.' });
      }

      if (!occasions.length) {
        return res.status(400).json({ error: 'Add at least one occasion before saving.' });
      }

      if (occasions.length > 10) {
        return res.status(400).json({ error: 'You can save up to 10 occasions per email address.' });
      }

      for (const occasion of occasions) {
        if (!occasion.person_name || !occasion.occasion_type || !occasion.occasion_date || !occasion.relevance) {
          return res.status(400).json({
            error: 'Each occasion needs a name, occasion type, date, and relevance.',
          });
        }
        if (!isValidIsoDate(occasion.occasion_date)) {
          return res.status(400).json({ error: 'Each occasion date must be a valid date.' });
        }
      }

      const existing = await sql`SELECT id FROM remember_registrations WHERE email = ${email}`;

      let registration;
      if (existing.rows[0]) {
        const updated = await sql`
          UPDATE remember_registrations
          SET
            full_name = ${fullName},
            phone = ${phone},
            updated_at = now()
          WHERE id = ${existing.rows[0].id}
          RETURNING *
        `;
        registration = updated.rows[0];

        await sql`DELETE FROM remember_occasions WHERE registration_id = ${registration.id}`;
      } else {
        const created = await sql`
          INSERT INTO remember_registrations (full_name, email, phone)
          VALUES (${fullName}, ${email}, ${phone})
          RETURNING *
        `;
        registration = created.rows[0];
      }

      for (const occasion of occasions) {
        await sql`
          INSERT INTO remember_occasions (
            registration_id,
            person_name,
            occasion_type,
            occasion_date,
            relevance,
            position
          )
          VALUES (
            ${registration.id},
            ${occasion.person_name},
            ${occasion.occasion_type},
            ${occasion.occasion_date},
            ${occasion.relevance},
            ${occasion.position}
          )
        `;
      }

      const [saved] = await attachOccasions([registration]);
      return res.status(existing.rows[0] ? 200 : 201).json({
        message: existing.rows[0]
          ? 'Your Barefoot Remembers dates have been updated.'
          : 'Your Barefoot Remembers dates have been saved.',
        registration: saved,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (segments.length === 1) {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const id = Number.parseInt(segments[0], 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid registration id.' });
    }

    const { rows } = await sql`SELECT * FROM remember_registrations WHERE id = ${id}`;
    if (!rows[0]) {
      return res.status(404).json({ error: 'Registration not found.' });
    }

    if (req.method === 'GET') {
      const [saved] = await attachOccasions(rows);
      return res.status(200).json(saved);
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM remember_registrations WHERE id = ${id}`;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};

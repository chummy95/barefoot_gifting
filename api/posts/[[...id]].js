const { sql } = require('../_lib/db');
const { requireAuth, verifyToken, getTokenFromReq } = require('../_lib/auth');
const { cors } = require('../_lib/cors');
const { getSegments } = require('../_lib/path-segments');

let schemaPromise = null;

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function requireAuthOptional(req) {
  const token = getTokenFromReq(req);
  return token ? verifyToken(token) : null;
}

async function ensurePostsSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'Keepsake Edit',
          excerpt TEXT,
          body_html TEXT NOT NULL DEFAULT '',
          author TEXT NOT NULL DEFAULT 'Barefoot Gifting Team',
          read_time TEXT,
          status TEXT NOT NULL DEFAULT 'published',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      await sql.query(`
        CREATE TABLE IF NOT EXISTS post_images (
          id SERIAL PRIMARY KEY,
          post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          alt TEXT,
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

async function attachImages(posts) {
  if (!posts.length) return posts;

  const ids = posts.map((post) => post.id);
  const { rows: images } = await sql.query(
    `SELECT * FROM post_images WHERE post_id = ANY($1) ORDER BY position ASC`,
    [ids]
  );

  return posts.map((post) => ({
    ...post,
    images: images.filter((image) => image.post_id === post.id),
  }));
}

async function findPost(idOrSlug) {
  const isNumeric = /^\d+$/.test(idOrSlug);
  const { rows } = isNumeric
    ? await sql`SELECT * FROM posts WHERE id = ${idOrSlug}`
    : await sql`SELECT * FROM posts WHERE slug = ${idOrSlug}`;
  return rows[0];
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  await ensurePostsSchema();

  const segments = getSegments(req, '/api/posts');

  if (segments.length === 0) {
    if (req.method === 'GET') {
      const { category, search, status } = req.query;
      const auth = requireAuthOptional(req);
      const isAdmin = auth && auth.role === 'admin';

      const params = [];
      let query = 'SELECT * FROM posts WHERE TRUE';

      if (category) {
        params.push(category);
        query += ` AND category = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        query += ` AND (title ILIKE $${params.length} OR excerpt ILIKE $${params.length} OR body_html ILIKE $${params.length})`;
      }

      if (isAdmin) {
        if (status) {
          params.push(status);
          query += ` AND status = $${params.length}`;
        }
      } else {
        query += ` AND status = 'published'`;
      }

      query += ' ORDER BY created_at DESC';

      const { rows } = await sql.query(query, params);
      return res.status(200).json(await attachImages(rows));
    }

    if (req.method === 'POST') {
      const user = requireAuth(req, res, ['admin']);
      if (!user) return;

      const {
        title,
        slug: requestedSlug,
        category,
        excerpt,
        body_html,
        author,
        read_time,
        status,
        images,
      } = req.body || {};

      if (!title || !String(title).trim() || !body_html || !String(body_html).trim()) {
        return res.status(400).json({ error: 'title and body_html are required' });
      }

      let slug = slugify(requestedSlug || title);
      if (!slug) {
        return res.status(400).json({ error: 'A valid slug could not be generated for this post' });
      }

      const existing = await sql`SELECT id FROM posts WHERE slug = ${slug}`;
      if (existing.rows.length) slug = `${slug}-${Date.now().toString().slice(-5)}`;

      const { rows } = await sql`
        INSERT INTO posts (slug, title, category, excerpt, body_html, author, read_time, status)
        VALUES (
          ${slug},
          ${title.trim()},
          ${String(category || 'Keepsake Edit').trim() || 'Keepsake Edit'},
          ${excerpt ? String(excerpt).trim() : ''},
          ${String(body_html).trim()},
          ${author ? String(author).trim() : 'Barefoot Gifting Team'},
          ${read_time ? String(read_time).trim() : null},
          ${status || 'published'}
        )
        RETURNING *
      `;
      const post = rows[0];

      if (Array.isArray(images)) {
        for (let index = 0; index < images.length; index += 1) {
          const image = images[index];
          if (!image || !image.url) continue;
          await sql`
            INSERT INTO post_images (post_id, url, alt, position)
            VALUES (${post.id}, ${image.url}, ${image.alt || title}, ${index})
          `;
        }
      }

      const [saved] = await attachImages([post]);
      return res.status(201).json(saved);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (segments.length === 1) {
    const id = segments[0];

    if (req.method === 'GET') {
      const auth = requireAuthOptional(req);
      const isAdmin = auth && auth.role === 'admin';
      const post = await findPost(id);

      if (!post) return res.status(404).json({ error: 'Post not found' });
      if (!isAdmin && post.status !== 'published') {
        return res.status(404).json({ error: 'Post not found' });
      }

      const [saved] = await attachImages([post]);
      return res.status(200).json(saved);
    }

    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const post = await findPost(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const {
        title,
        slug: requestedSlug,
        category,
        excerpt,
        body_html,
        author,
        read_time,
        status,
        images,
      } = req.body || {};

      let nextSlug = null;
      if (requestedSlug !== undefined) {
        nextSlug = slugify(requestedSlug);
        if (!nextSlug) {
          return res.status(400).json({ error: 'A valid slug could not be generated for this post' });
        }
        if (nextSlug !== post.slug) {
          const conflict = await sql`SELECT id FROM posts WHERE slug = ${nextSlug} AND id <> ${post.id}`;
          if (conflict.rows.length) {
            return res.status(409).json({ error: 'Another post already uses that slug' });
          }
        }
      }

      const { rows } = await sql`
        UPDATE posts
        SET
          slug = COALESCE(${nextSlug}, slug),
          title = COALESCE(${title ? String(title).trim() : null}, title),
          category = COALESCE(${category ? String(category).trim() : null}, category),
          excerpt = ${excerpt !== undefined ? (excerpt ? String(excerpt).trim() : '') : sql`excerpt`},
          body_html = ${body_html !== undefined ? String(body_html).trim() : sql`body_html`},
          author = COALESCE(${author ? String(author).trim() : null}, author),
          read_time = ${read_time !== undefined ? (read_time ? String(read_time).trim() : null) : sql`read_time`},
          status = COALESCE(${status}, status),
          updated_at = now()
        WHERE id = ${post.id}
        RETURNING *
      `;

      if (Array.isArray(images)) {
        await sql`DELETE FROM post_images WHERE post_id = ${post.id}`;
        for (let index = 0; index < images.length; index += 1) {
          const image = images[index];
          if (!image || !image.url) continue;
          await sql`
            INSERT INTO post_images (post_id, url, alt, position)
            VALUES (${post.id}, ${image.url}, ${image.alt || rows[0].title}, ${index})
          `;
        }
      }

      const [saved] = await attachImages(rows);
      return res.status(200).json(saved);
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM posts WHERE id = ${post.id}`;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(404).json({ error: 'Not found' });
};

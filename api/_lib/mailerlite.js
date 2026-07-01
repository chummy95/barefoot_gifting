const MAILERLITE_BASE_URL = 'https://connect.mailerlite.com/api';
const groupCache = new Map();

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function getApiKey() {
  return cleanText(process.env.MAILERLITE_API_KEY);
}

function isConfigured() {
  return !!getApiKey();
}

function formatMailerLiteDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (part) => String(part).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-') + ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function getDefaultGroupConfig(source) {
  const allContacts = process.env.MAILERLITE_GROUP_ALL_CONTACTS;
  const sourceGroups = {
    newsletter: process.env.MAILERLITE_GROUP_SUBSCRIBERS,
    popup: process.env.MAILERLITE_GROUP_SUBSCRIBERS,
    customer: process.env.MAILERLITE_GROUP_CUSTOMERS,
    remembers: process.env.MAILERLITE_GROUP_REMEMBERS,
  };

  return [allContacts, sourceGroups[source]].filter(Boolean);
}

function parseGroupIdentifiers(values) {
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list
    .flatMap((value) => String(value || '').split(/[\n,;]+/))
    .map((value) => cleanText(value))
    .filter(Boolean))];
}

async function mailerLiteFetch(path, init = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    const error = new Error('MailerLite is not configured.');
    error.code = 'MAILERLITE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`${MAILERLITE_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
      (Array.isArray(data?.errors?.email) ? data.errors.email[0] : null) ||
      `MailerLite request failed with status ${response.status}.`
    );
    error.code = `MAILERLITE_${response.status}`;
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

async function listGroups() {
  const response = await mailerLiteFetch('/groups?limit=1000');
  return Array.isArray(response?.data) ? response.data : [];
}

async function getSubscriber(email) {
  try {
    const response = await mailerLiteFetch(`/subscribers/${encodeURIComponent(email)}`);
    return response?.data || null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function createGroup(name) {
  const response = await mailerLiteFetch('/groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return response?.data || null;
}

async function resolveGroupIdentifier(identifier) {
  const token = cleanText(identifier);
  if (!token) return null;
  if (/^\d+$/.test(token)) return token;
  if (groupCache.has(token)) return groupCache.get(token);

  const groups = await listGroups();
  const match = groups.find((group) => cleanText(group?.name).toLowerCase() === token.toLowerCase());
  if (match?.id) {
    groupCache.set(token, match.id);
    return match.id;
  }

  try {
    const created = await createGroup(token);
    if (created?.id) {
      groupCache.set(token, created.id);
      return created.id;
    }
  } catch (error) {
    if (error.status === 422) {
      const refreshedGroups = await listGroups();
      const refreshedMatch = refreshedGroups.find((group) => cleanText(group?.name).toLowerCase() === token.toLowerCase());
      if (refreshedMatch?.id) {
        groupCache.set(token, refreshedMatch.id);
        return refreshedMatch.id;
      }
    }
    throw error;
  }

  return null;
}

async function resolveGroupIds(values) {
  const identifiers = parseGroupIdentifiers(values);
  if (!identifiers.length) return [];

  const ids = [];
  for (const identifier of identifiers) {
    const id = await resolveGroupIdentifier(identifier);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function buildFields({ name, phone, city, state, country, postalCode }) {
  const fields = {};
  if (cleanText(name)) fields.name = cleanText(name);
  if (cleanText(phone)) fields.phone = cleanText(phone);
  if (cleanText(city)) fields.city = cleanText(city);
  if (cleanText(state)) fields.state = cleanText(state);
  if (cleanText(country)) fields.country = cleanText(country);
  if (cleanText(postalCode)) fields.z_i_p = cleanText(postalCode);
  return fields;
}

async function syncSubscriber(options = {}) {
  const email = normalizeEmail(options.email);
  if (!email) {
    const error = new Error('A valid email address is required.');
    error.code = 'MAILERLITE_INVALID_EMAIL';
    throw error;
  }

  if (!isConfigured()) {
    return { skipped: true, reason: 'not_configured' };
  }

  const groups = await resolveGroupIds([
    ...getDefaultGroupConfig(options.source),
    ...(Array.isArray(options.groups) ? options.groups : [options.groups]),
  ]);

  const existingSubscriber = options.statusWhenNew ? await getSubscriber(email) : null;

  const fields = buildFields(options);
  const payload = {
    email,
    groups,
    fields,
  };

  if (options.status) payload.status = options.status;
  if (!existingSubscriber && options.statusWhenNew) payload.status = options.statusWhenNew;
  if (options.resubscribe) payload.resubscribe = true;
  if (cleanText(options.ipAddress)) payload.ip_address = cleanText(options.ipAddress);
  if (cleanText(options.optinIp)) payload.optin_ip = cleanText(options.optinIp);

  const optedInAt = formatMailerLiteDate(options.optedInAt);
  if (optedInAt) payload.opted_in_at = optedInAt;

  const subscribedAt = formatMailerLiteDate(options.subscribedAt);
  if (subscribedAt) payload.subscribed_at = subscribedAt;

  const response = await mailerLiteFetch('/subscribers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return {
    skipped: false,
    data: response?.data || null,
    groups,
  };
}

module.exports = {
  isConfigured,
  syncSubscriber,
};

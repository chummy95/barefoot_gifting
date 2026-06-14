const ROOT_SENTINEL = '__root__';

function getSegments(req, basePath) {
  const queryValue = req.query && req.query.id;
  if (queryValue) {
    return Array.isArray(queryValue) ? queryValue : [queryValue];
  }

  const pathname = String(req.url || '').split('?')[0] || '';
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) return [];

  const tail = pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
  if (!tail || tail === ROOT_SENTINEL) return [];
  return tail.split('/').filter(Boolean);
}

module.exports = {
  ROOT_SENTINEL,
  getSegments,
};

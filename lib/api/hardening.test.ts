/**
 * Tests de la couche de durcissement de l’API.
 *
 * Ces quatre modules (quota, pagination, cache, métriques) sont utilisés par
 * toutes les routes : une régression ici se verrait partout. Les tests sont
 * volontairement directs — on appelle les fonctions, on regarde les valeurs.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { consume, identityOf, rateHeaders, resetRateLimits, ruleFor } from './rateLimit';
import { fold, matchesQuery, pageHeaders, paginate, parsePageQuery, queryPage, sortItems } from './pagination';
import { cached, etagOf, ifNoneMatch, invalidate, jsonWithEtag, stableStringify } from './cache';
import { metricsSnapshot, normalizePath, recordError, recordRequest, resetMetrics } from './metrics';

describe('limitation de débit', () => {
  beforeEach(() => resetRateLimits());

  it('choisit la règle la plus spécifique', () => {
    assert.equal(ruleFor('POST', '/api/auth/login')?.name, 'auth');
    assert.equal(ruleFor('POST', '/api/ai/ask')?.name, 'ai');
    assert.equal(ruleFor('POST', '/api/solve')?.name, 'solve');
    assert.equal(ruleFor('GET', '/api/projects')?.name, 'read');
    assert.equal(ruleFor('DELETE', '/api/projects/prj_1')?.name, 'delete');
    assert.equal(ruleFor('GET', '/autre'), null);
  });

  it('refuse au-delà du quota et indique combien attendre', () => {
    const now = 1_000_000;
    let last = consume('i:1.2.3.4', 'POST', '/api/auth/login', now);
    for (let index = 0; index < 11; index += 1) {
      last = consume('i:1.2.3.4', 'POST', '/api/auth/login', now);
      assert.equal(last.allowed, true);
    }
    const refused = consume('i:1.2.3.4', 'POST', '/api/auth/login', now);
    assert.equal(refused.allowed, false);
    assert.equal(refused.rule, 'auth');
    assert.ok(refused.retryAfter >= 1);
    assert.equal(rateHeaders(refused)['Retry-After'], String(refused.retryAfter));
  });

  it('recharge les jetons avec le temps', () => {
    const start = 5_000_000;
    for (let index = 0; index < 12; index += 1) consume('i:9.9.9.9', 'POST', '/api/auth/login', start);
    assert.equal(consume('i:9.9.9.9', 'POST', '/api/auth/login', start).allowed, false);
    // une fenêtre complète plus tard, le seau autorise de nouveau
    const later = start + 5 * 60_000 + 10;
    assert.equal(consume('i:9.9.9.9', 'POST', '/api/auth/login', later).allowed, true);
  });

  it('sépare les identités et ne fuit pas le cookie', () => {
    const withCookie = identityOf({ cookie: 'spark_session=abcdef0123456789' });
    assert.ok(withCookie.startsWith('s:'));
    assert.ok(!withCookie.includes('abcdef'));
    assert.equal(identityOf({ cookie: '' }), 'i:local');
    assert.equal(identityOf({ 'x-forwarded-for': '82.1.2.3, 10.0.0.1' }), 'i:82.1.2.3');
    // un quota épuisé par l’un ne bloque pas l’autre
    for (let index = 0; index < 12; index += 1) consume('i:a', 'POST', '/api/auth/login');
    assert.equal(consume('i:a', 'POST', '/api/auth/login').allowed, false);
    assert.equal(consume('i:b', 'POST', '/api/auth/login').allowed, true);
  });
});

describe('pagination et recherche', () => {
  it('borne les paramètres', () => {
    const query = parsePageQuery({ page: '-3', size: '9999', q: '  théorème  ' });
    assert.equal(query.page, 1);
    assert.equal(query.size, 100);
    assert.equal(query.q, 'théorème');
    assert.equal(query.order, 'asc');
    assert.equal(parsePageQuery({}).size, 24);
  });

  it('plie les accents et cherche tous les mots', () => {
    assert.equal(fold('Thévenin — équivalent'), 'thevenin equivalent');
    const items = [
      { title: 'Théorème de Thévenin', body: 'générateur équivalent' },
      { title: 'Loi de Norton', body: 'source de courant' },
    ];
    const fields = (item: (typeof items)[number]) => [item.title, item.body];
    assert.equal(matchesQuery(items[0], 'thevenin', fields), true);
    assert.equal(matchesQuery(items[0], 'generateur', fields), true);
    assert.equal(matchesQuery(items[0], 'norton', fields), false);
    assert.equal(matchesQuery(items[0], 'theoreme norton', fields), false);
  });

  it('trie dans les deux sens et pagine', () => {
    const values = [{ n: 3 }, { n: 1 }, { n: 2 }];
    assert.deepEqual(sortItems(values, 'n', 'asc', (item, field) => item[field as 'n']).map((item) => item.n), [1, 2, 3]);
    assert.deepEqual(sortItems(values, 'n', 'desc', (item, field) => item[field as 'n']).map((item) => item.n), [3, 2, 1]);

    const query = parsePageQuery({ page: '2', size: '2' });
    const result = paginate([1, 2, 3, 4, 5], query);
    assert.deepEqual(result.rows, [3, 4]);
    assert.equal(result.total, 5);
    assert.equal(result.pages, 3);
    assert.equal(result.hasNext, true);
    assert.equal(result.hasPrev, true);
  });

  it('enchaîne recherche, tri et pagination', () => {
    const items = [
      { title: 'Impédance', tag: 'ac' },
      { title: 'Admittance', tag: 'ac' },
      { title: 'Résistance', tag: 'dc' },
    ];
    const query = parsePageQuery({ q: 'ance', sort: 'title', order: 'desc', size: '2' });
    const result = queryPage(items, query, {
      search: (item) => [item.title],
      sort: (item, field) => (field === 'title' ? item.title : ''),
    });
    // « ance » est contenu dans Impédance, Admittance et Résistance
    assert.equal(result.total, 3);
    assert.deepEqual(result.rows.map((item) => item.title), ['Résistance', 'Impédance']);
    assert.equal(pageHeaders(result)['X-Total-Count'], '3');
  });

  it('ramène une page hors bornes sur la dernière', () => {
    const result = paginate([1, 2, 3], parsePageQuery({ page: '9', size: '2' }));
    assert.equal(result.page, 2);
    assert.deepEqual(result.rows, [3]);
  });
});

describe('cache et ETag', () => {
  it('met en cache et compte les succès', async () => {
    invalidate();
    let calls = 0;
    const producer = () => {
      calls += 1;
      return { value: 42 };
    };
    const first = await cached('test:a', { ttlMs: 5_000 }, producer);
    const second = await cached('test:a', { ttlMs: 5_000 }, producer);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
    invalidate('test:');
    await cached('test:a', { ttlMs: 5_000 }, producer);
    assert.equal(calls, 2);
  });

  it('produit une empreinte stable indépendante de l’ordre des clés', () => {
    assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
    assert.equal(etagOf({ a: 1, b: 2 }), etagOf({ b: 2, a: 1 }));
    assert.notEqual(etagOf({ a: 1 }), etagOf({ a: 2 }));
  });

  it('reconnaît un ETag faible et renvoie 304', async () => {
    const payload = { hello: 'monde' };
    const etag = etagOf(payload);
    assert.equal(ifNoneMatch({ 'if-none-match': etag }, etag), true);
    assert.equal(ifNoneMatch({ 'if-none-match': `"autre", ${etag}` }, etag), true);
    assert.equal(ifNoneMatch({ 'if-none-match': '"autre"' }, etag), false);
    assert.equal(ifNoneMatch({}, etag), false);

    const full = jsonWithEtag({}, payload, { maxAge: 30 });
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('ETag'), etag);
    assert.match(full.headers.get('Cache-Control') ?? '', /max-age=30/);

    const cachedResponse = jsonWithEtag({ 'if-none-match': etag }, payload);
    assert.equal(cachedResponse.status, 304);
    assert.equal(await cachedResponse.text(), '');
  });
});

describe('métriques', () => {
  beforeEach(() => resetMetrics());

  it('agrège compteurs et latences', () => {
    recordRequest({ method: 'GET', path: '/api/projects', status: 200, durationMs: 10, at: Date.now() });
    recordRequest({ method: 'GET', path: '/api/projects', status: 200, durationMs: 30, at: Date.now() });
    recordRequest({ method: 'POST', path: '/api/solve', status: 500, durationMs: 300, at: Date.now() });
    recordRequest({ method: 'GET', path: '/api/catalog', status: 304, durationMs: 2, at: Date.now() });

    const snapshot = metricsSnapshot();
    assert.equal(snapshot.counter.total, 4);
    assert.equal(snapshot.counter.ok, 2);
    assert.equal(snapshot.counter.serverError, 1);
    assert.equal(snapshot.counter.notModified, 1);
    assert.equal(snapshot.byMethod.GET, 3);
    assert.equal(snapshot.latency.max, 300);
    assert.ok(snapshot.latency.p50 > 0);
    assert.equal(snapshot.slowest[0].path, '/api/solve');
  });

  it('normalise les identifiants dynamiques', () => {
    assert.equal(normalizePath('/api/projects/prj_8f3a2b1c'), '/api/projects/:projet');
    assert.ok(normalizePath('/api/circuits/cir_abc123').includes(':circuit'));
    assert.ok(normalizePath('/api/rooms/ABC123/events').includes(':code'));
    assert.equal(normalizePath('/api/health'), '/api/health');
  });

  it('conserve les erreurs déclarées', () => {
    recordError('POST', '/api/ai/ask', 500, 'fournisseur injoignable');
    const snapshot = metricsSnapshot();
    assert.equal(snapshot.recentErrors[0].message, 'fournisseur injoignable');
    assert.equal(snapshot.recentErrors[0].status, 500);
  });
});

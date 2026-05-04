const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const express = require('express');
const rateLimit = require('express-rate-limit');

const PORT = Number(process.env.PORT || 3333);
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const USE_POSTGRES = Boolean(DATABASE_URL);
const DB_PATH = path.join(__dirname, 'data', 'licenses.sqlite3');
const APP_KEY_FILE = path.join(__dirname, 'data', 'app-key.txt');
const DEMO_LICENSE_KEY = String(process.env.NOVAPAD_DEMO_LICENSE_KEY || 'NOVAPAD-DEMO-1234').trim();
const DEMO_LICENSE_HASH = sha256(DEMO_LICENSE_KEY);
const FEATURE_KEYS = ['sync', 'export_pdf', 'themes', 'ai_assist'];
const PLAN_DEFAULTS = {
  free: { maxDevices: 1, validityDays: null, features: { sync: false, export_pdf: false, themes: false, ai_assist: false } },
  trial: { maxDevices: 1, validityDays: 14, features: { sync: true, export_pdf: true, themes: true, ai_assist: false } },
  pro: { maxDevices: 3, validityDays: 365, features: { sync: true, export_pdf: true, themes: true, ai_assist: false } },
  lifetime: { maxDevices: 5, validityDays: null, features: { sync: true, export_pdf: true, themes: true, ai_assist: false } },
};

let sqliteDb = null;
let pgPool = null;

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function baseLicenseKey() {
  return `NP-${crypto.randomBytes(18).toString('base64url')}`;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readAppKeyFile() {
  try {
    if (!fs.existsSync(APP_KEY_FILE)) return '';
    return String(fs.readFileSync(APP_KEY_FILE, 'utf8') || '').trim();
  } catch {
    return '';
  }
}

function getAppKey() {
  return String(
    process.env.NOVAPAD_LICENSE_APP_KEY ||
    process.env.NOVAPAD_APP_KEY ||
    readAppKeyFile() ||
    'novapad-dev-key'
  ).trim();
}

function normalizeSql(sql) {
  if (!USE_POSTGRES) return sql;
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

async function dbGet(sql, params = []) {
  if (USE_POSTGRES) {
    const result = await pgPool.query(normalizeSql(sql), params);
    return result.rows[0] || null;
  }
  return sqliteDb.prepare(sql).get(...params);
}

async function dbAll(sql, params = []) {
  if (USE_POSTGRES) {
    const result = await pgPool.query(normalizeSql(sql), params);
    return result.rows;
  }
  return sqliteDb.prepare(sql).all(...params);
}

async function dbRun(sql, params = []) {
  if (USE_POSTGRES) {
    const result = await pgPool.query(normalizeSql(sql), params);
    return result.rows[0] || { changes: result.rowCount };
  }
  const result = sqliteDb.prepare(sql).run(...params);
  return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
}

function publicUserRow(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    created_at: user.created_at || null,
    updated_at: user.updated_at || null,
  };
}

async function upsertUserRecord({ name, email, passwordHash, avatarUrl = null } = {}) {
  const normalizedName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPasswordHash = String(passwordHash || '').trim();
  const normalizedAvatarUrl = avatarUrl == null ? null : String(avatarUrl).trim() || null;

  if (!normalizedName) throw new Error('name is required.');
  if (!normalizedEmail) throw new Error('email is required.');
  if (!normalizedPasswordHash) throw new Error('passwordHash is required.');

  if (USE_POSTGRES) {
    const result = await pgPool.query(`
      INSERT INTO users (name, email, password_hash, avatar_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, now()::text, now()::text)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = now()::text
      RETURNING id, name, email, created_at, updated_at
    `, [normalizedName, normalizedEmail, normalizedPasswordHash, normalizedAvatarUrl]);
    return result.rows[0] || null;
  }

  await dbRun(`
    INSERT INTO users (name, email, password_hash, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      password_hash = excluded.password_hash,
      avatar_url = excluded.avatar_url,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `, [normalizedName, normalizedEmail, normalizedPasswordHash, normalizedAvatarUrl]);

  return dbGet('SELECT id, name, email, created_at, updated_at FROM users WHERE email = ?', [normalizedEmail]);
}

async function initPostgres() {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      license_key_hash TEXT NOT NULL UNIQUE,
      user_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free'
        CHECK(plan IN ('free', 'trial', 'pro', 'lifetime')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'trial', 'expired', 'revoked')),
      max_devices INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      activated_at TEXT,
      last_verified_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT now()::text,
      updated_at TEXT NOT NULL DEFAULT now()::text
    );

    CREATE TABLE IF NOT EXISTS license_devices (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      device_fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT 'Dispositivo desconhecido',
      platform TEXT,
      app_version TEXT,
      approved INTEGER NOT NULL DEFAULT 1,
      activated_at TEXT NOT NULL DEFAULT now()::text,
      last_seen_at TEXT NOT NULL DEFAULT now()::text,
      revoked_at TEXT,
      UNIQUE(license_id, device_fingerprint)
    );

    CREATE TABLE IF NOT EXISTS entitlements (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      value TEXT,
      UNIQUE(license_id, feature_key)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT now()::text,
      updated_at TEXT NOT NULL DEFAULT now()::text
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_key_hash ON licenses(license_key_hash);
    CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
    CREATE INDEX IF NOT EXISTS idx_license_devices_license_id ON license_devices(license_id);
    CREATE INDEX IF NOT EXISTS idx_license_devices_fingerprint ON license_devices(device_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_entitlements_license_id ON entitlements(license_id);
  `);

  await pgPool.query(`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS avatar_url TEXT
  `);
}

function initSqlite() {
  const BetterSqlite3 = require('better-sqlite3');
  ensureDir(DB_PATH);
  sqliteDb = new BetterSqlite3(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      license_key_hash TEXT NOT NULL UNIQUE,
      user_id TEXT,
      plan TEXT NOT NULL DEFAULT 'free'
        CHECK(plan IN ('free', 'trial', 'pro', 'lifetime')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'trial', 'expired', 'revoked')),
      max_devices INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      activated_at TEXT,
      last_verified_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS license_devices (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      device_fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT 'Dispositivo desconhecido',
      platform TEXT,
      app_version TEXT,
      approved INTEGER NOT NULL DEFAULT 1,
      activated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      revoked_at TEXT,
      UNIQUE(license_id, device_fingerprint)
    );

    CREATE TABLE IF NOT EXISTS entitlements (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      value TEXT,
      UNIQUE(license_id, feature_key)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}

function normalizeFeatureRows(plan, rows = []) {
  if (rows.length) {
    return rows.map(row => ({
      featureKey: row.feature_key,
      enabled: row.enabled === 1 || row.enabled === true,
      value: row.value ?? null,
    }));
  }

  const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free;
  return FEATURE_KEYS.map(featureKey => ({
    featureKey,
    enabled: Boolean(defaults.features[featureKey]),
    value: null,
  }));
}

function normalizeFeatureConfig(input = {}, plan = 'free') {
  const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free;
  const normalized = FEATURE_KEYS.map(featureKey => ({
    featureKey,
    enabled: Boolean(defaults.features[featureKey]),
    value: null,
  }));

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== 'object') continue;
      const featureKey = String(item.featureKey || item.key || item.name || '').trim();
      const target = normalized.find(entry => entry.featureKey === featureKey);
      if (!target) continue;
      target.enabled = item.enabled === true || item.enabled === 1 || item.enabled === '1' || item.enabled === 'true';
      target.value = item.value == null ? null : String(item.value);
    }
    return normalized;
  }

  if (input && typeof input === 'object') {
    for (const [featureKey, enabled] of Object.entries(input)) {
      const target = normalized.find(entry => entry.featureKey === featureKey);
      if (!target) continue;
      target.enabled = enabled === true || enabled === 1 || enabled === '1' || enabled === 'true';
    }
  }

  return normalized;
}

function computeExpiresAt({ expiresAt, validityDays, plan }) {
  if (plan === 'lifetime') return null;
  if (expiresAt) return String(expiresAt).trim();
  const days = Number(validityDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + Math.floor(days) * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeLicensePlan(value) {
  const plan = String(value || 'free').trim().toLowerCase();
  return PLAN_DEFAULTS[plan] ? plan : 'free';
}

function normalizeLicenseStatus(value, plan = 'free') {
  const status = String(value || '').trim().toLowerCase();
  if (['active', 'trial', 'expired', 'revoked'].includes(status)) return status;
  return plan === 'trial' ? 'trial' : 'active';
}

async function licenseToResponse(license) {
  if (!license) return null;
  const features = await dbAll(
    'SELECT feature_key, enabled, value FROM entitlements WHERE license_id = ? ORDER BY feature_key',
    [license.id]
  );
  return {
    id: license.id,
    userId: license.user_id || null,
    plan: license.plan,
    status: license.status,
    max_devices: license.max_devices,
    expires_at: license.expires_at || null,
    activated_at: license.activated_at || null,
    last_verified_at: license.last_verified_at || null,
    revoked_at: license.revoked_at || null,
    features: normalizeFeatureRows(license.plan, features),
  };
}

function responseFromLicense(license) {
  return licenseToResponse(license);
}

function getLicenseByHash(hash) {
  return dbGet('SELECT * FROM licenses WHERE license_key_hash = ?', [hash]);
}

function getLicenseByUserId(userId) {
  return dbGet(
    'SELECT * FROM licenses WHERE user_id = ? ORDER BY COALESCE(activated_at, created_at) DESC LIMIT 1',
    [userId]
  );
}

async function upsertEntitlements(licenseId, plan, rows = null) {
  const existing = rows || await dbAll('SELECT feature_key, enabled, value FROM entitlements WHERE license_id = ?', [licenseId]);
  if (existing.length && !rows) return existing;

  const items = rows || normalizeFeatureRows(plan);
  for (const item of items) {
    await dbRun(`
      INSERT INTO entitlements (license_id, feature_key, enabled, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(license_id, feature_key) DO UPDATE SET
        enabled = excluded.enabled,
        value = excluded.value
    `, [licenseId, item.featureKey, item.enabled ? 1 : 0, item.value ?? null]);
  }
  return dbAll('SELECT feature_key, enabled, value FROM entitlements WHERE license_id = ? ORDER BY feature_key', [licenseId]);
}

async function createLicenseRecord(input = {}) {
  const plan = normalizeLicensePlan(input.plan);
  const status = normalizeLicenseStatus(input.status, plan);
  const maxDevices = Math.max(1, Number(input.max_devices ?? input.maxDevices ?? PLAN_DEFAULTS[plan].maxDevices) || 1);
  const expiresAt = computeExpiresAt({
    expiresAt: input.expires_at ?? input.expiresAt ?? null,
    validityDays: input.validity_days ?? input.validityDays ?? PLAN_DEFAULTS[plan].validityDays,
    plan,
  });
  const licenseKey = String(input.license_key || input.licenseKey || baseLicenseKey()).trim();
  const userId = String(input.user_id || input.userId || '').trim() || null;
  const features = normalizeFeatureConfig(input.features ?? input.entitlements ?? null, plan);
  const now = nowIso();

  const license = await dbGet(`
    INSERT INTO licenses (license_key_hash, user_id, plan, status, max_devices, expires_at, activated_at, last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [sha256(licenseKey), userId, plan, status, maxDevices, expiresAt, now, now]);

  await upsertEntitlements(license.id, plan, features);
  return {
    licenseKey,
    license: await responseFromLicense(await dbGet('SELECT * FROM licenses WHERE id = ?', [license.id])),
  };
}

async function seedDemoLicense() {
  if (process.env.NODE_ENV === 'production' && !process.env.NOVAPAD_DEMO_LICENSE_KEY) return;
  const existing = await getLicenseByHash(DEMO_LICENSE_HASH);
  if (existing) return;

  const license = await dbGet(`
    INSERT INTO licenses (license_key_hash, user_id, plan, status, max_devices, activated_at, last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `, [DEMO_LICENSE_HASH, null, 'pro', 'active', 3, nowIso(), nowIso()]);
  await upsertEntitlements(license.id, 'pro');
}

function requireAppKey(req, res, next) {
  const provided = String(req.get('X-App-Key') || '').trim();
  if (!provided || provided !== getAppKey()) {
    return res.status(401).json({ success: false, error: 'Invalid API key.' });
  }
  next();
}

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit exceeded.' },
});

function wrapAsync(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validateLicenseInput(req, res) {
  const licenseKeyHash = String(req.body?.license_key_hash || req.body?.licenseKeyHash || '').trim();
  if (!licenseKeyHash) {
    res.status(400).json({ success: false, error: 'license_key_hash is required.' });
    return null;
  }
  return licenseKeyHash;
}

async function registerDeviceForLicense(license, body = {}) {
  const deviceFingerprint = String(body.device_fingerprint || body.deviceFingerprint || '').trim();
  if (!deviceFingerprint) {
    return { approved: false, blocked: true, reason: 'device_fingerprint is required.' };
  }

  const deviceName = String(body.device_name || body.deviceName || 'Dispositivo desconhecido').trim() || 'Dispositivo desconhecido';
  const platform = body.platform || null;
  const appVersion = body.app_version || body.appVersion || null;

  const activeCount = (await dbGet(
    'SELECT COUNT(*) AS count FROM license_devices WHERE license_id = ? AND revoked_at IS NULL',
    [license.id]
  ))?.count || 0;

  const existing = await dbGet(
    'SELECT * FROM license_devices WHERE license_id = ? AND device_fingerprint = ?',
    [license.id, deviceFingerprint]
  );

  if (!existing && Number(activeCount) >= Number(license.max_devices || 1)) {
    return {
      approved: false,
      blocked: true,
      reason: 'Device limit reached.',
      max_devices: license.max_devices,
      active_devices: Number(activeCount),
    };
  }

  await dbRun(`
    INSERT INTO license_devices (license_id, device_fingerprint, device_name, platform, app_version, approved, last_seen_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, NULL)
    ON CONFLICT(license_id, device_fingerprint) DO UPDATE SET
      device_name = excluded.device_name,
      platform = excluded.platform,
      app_version = excluded.app_version,
      approved = 1,
      last_seen_at = excluded.last_seen_at,
      revoked_at = NULL
  `, [license.id, deviceFingerprint, deviceName, platform, appVersion, nowIso()]);

  return {
    approved: true,
    blocked: false,
    max_devices: license.max_devices,
    active_devices: Number(activeCount) + (existing ? 0 : 1),
    device: {
      device_fingerprint: deviceFingerprint,
      device_name: deviceName,
      platform,
      app_version: appVersion,
    },
  };
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));
  app.use('/license', limiter);
  app.use('/license', requireAppKey);

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { ok: true, time: nowIso(), database: USE_POSTGRES ? 'postgres' : 'sqlite' } });
  });

  app.post('/users/register', limiter, requireAppKey, wrapAsync(async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const created = await upsertUserRecord({
      name: payload.name,
      email: payload.email,
      passwordHash: payload.password_hash || payload.passwordHash,
      avatarUrl: payload.avatar_url || payload.avatarUrl || null,
    });

    if (!created) {
      return res.status(500).json({ success: false, error: 'Unable to save user.' });
    }

    return res.status(201).json({
      success: true,
      data: { user: publicUserRow(created) },
    });
  }));

  app.post('/license/validate', wrapAsync(async (req, res) => {
    const licenseKeyHash = validateLicenseInput(req, res);
    if (!licenseKeyHash) return;

    const license = await getLicenseByHash(licenseKeyHash);
    if (!license) return res.status(404).json({ success: false, error: 'License not found.' });

    await dbRun('UPDATE licenses SET last_verified_at = ? WHERE id = ?', [nowIso(), license.id]);
    const response = await responseFromLicense(license);
    return res.json({
      success: true,
      data: {
        plan: response.plan,
        status: response.status,
        max_devices: response.max_devices,
        expires_at: response.expires_at,
        features: response.features,
        last_verified_at: nowIso(),
      },
    });
  }));

  app.post('/license/activate', wrapAsync(async (req, res) => {
    const licenseKeyHash = validateLicenseInput(req, res);
    if (!licenseKeyHash) return;

    const userId = String(req.body?.userId || req.body?.user_id || '').trim();
    const userEmail = String(req.body?.userEmail || req.body?.user_email || '').trim().toLowerCase();
    const license = await getLicenseByHash(licenseKeyHash);
    if (!license) return res.status(404).json({ success: false, error: 'License not found.' });
    if (license.status === 'revoked') return res.status(403).json({ success: false, error: 'License revoked.' });

    const boundUser = String(license.user_id || '').trim();
    const matchesBoundUser = !boundUser || boundUser === userId || (userEmail && boundUser.toLowerCase() === userEmail);
    if (!matchesBoundUser) {
      return res.status(409).json({ success: false, error: 'License already bound to another user.' });
    }

    const deviceResult = await registerDeviceForLicense(license, req.body || {});
    if (deviceResult.blocked) {
      return res.status(403).json({ success: false, error: deviceResult.reason, data: deviceResult });
    }

    const activatedAt = license.activated_at || nowIso();
    await dbRun(`
      UPDATE licenses
      SET user_id = ?,
          activated_at = ?,
          last_verified_at = ?,
          status = CASE WHEN status = 'revoked' THEN status ELSE 'active' END,
          updated_at = ?
      WHERE id = ?
    `, [userId || license.user_id || null, activatedAt, nowIso(), nowIso(), license.id]);

    const updated = await dbGet('SELECT * FROM licenses WHERE id = ?', [license.id]);
    await upsertEntitlements(updated.id, updated.plan);
    res.json({
      success: true,
      data: {
        ...await responseFromLicense(updated),
        device: deviceResult.device || null,
        approved: true,
      },
    });
  }));

  app.post('/license/device', wrapAsync(async (req, res) => {
    const licenseKeyHash = validateLicenseInput(req, res);
    if (!licenseKeyHash) return;

    const license = await getLicenseByHash(licenseKeyHash);
    if (!license) return res.status(404).json({ success: false, error: 'License not found.' });

    return res.json({ success: true, data: await registerDeviceForLicense(license, req.body || {}) });
  }));

  app.post('/license/admin/create', wrapAsync(async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const created = await createLicenseRecord(payload);
    return res.status(201).json({
      success: true,
      data: {
        license_key: created.licenseKey,
        license: created.license,
      },
    });
  }));

  app.get('/license/status/:userId', wrapAsync(async (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required.' });

    const license = await getLicenseByUserId(userId);
    if (!license) return res.status(404).json({ success: false, error: 'License not found.' });

    await dbRun('UPDATE licenses SET last_verified_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), license.id]);
    res.json({
      success: true,
      data: await responseFromLicense(await dbGet('SELECT * FROM licenses WHERE id = ?', [license.id])),
    });
  }));

  app.use((error, _req, res, _next) => {
    console.error('License server error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  });

  return app;
}

async function boot() {
  if (USE_POSTGRES) await initPostgres();
  else initSqlite();
  await seedDemoLicense();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`NovaPad license server running on http://localhost:${PORT}`);
    console.log(`Database: ${USE_POSTGRES ? 'postgres/supabase' : 'sqlite'}`);
    console.log(`Using app key: ${getAppKey() === 'novapad-dev-key' ? 'default dev key' : 'custom key from env/file'}`);
  });
}

boot().catch(error => {
  console.error('Failed to start NovaPad license server:', error);
  process.exit(1);
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load .env from the project root (Node built-in, no dotenv needed).
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* ignore malformed .env */ }
}

const env = (key, fallback = '') => {
  const v = process.env[key];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
};

const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string';
let generatedSecret = null;

export const config = {
  get port() { return Number(env('PORT', '4000')); },
  get geminiKey() { return env('GEMINI_API_KEY'); },
  get geminiModel() { return env('GEMINI_MODEL', 'gemini-2.5-flash'); },
  get geminiBase() { return env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'); },
  get groqKey() { return env('GROQ_API_KEY'); },
  get groqModel() { return env('GROQ_MODEL', 'llama-3.3-70b-versatile'); },
  get groqJsonSchema() { return env('GROQ_JSON_SCHEMA').toLowerCase() === 'true'; },
  get groqBase() { return env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'); },
  get databasePath() {
    const p = env('DATABASE_PATH', './server/data/nutrisense.db');
    return p === ':memory:' ? p : path.resolve(ROOT, p);
  },
  get clientOrigin() { return env('CLIENT_ORIGIN', ''); },
  get jwtSecret() {
    const fromEnv = env('JWT_SECRET');
    if (fromEnv && fromEnv !== PLACEHOLDER_SECRET) return fromEnv;
    if (generatedSecret) return generatedSecret;
    const dbPath = this.databasePath;
    if (dbPath === ':memory:') {
      generatedSecret = randomBytes(32).toString('hex');
      return generatedSecret;
    }
    // Persist a generated secret next to the database so logins survive restarts.
    const dir = path.dirname(dbPath);
    const file = path.join(dir, '.jwt-secret');
    mkdirSync(dir, { recursive: true });
    if (existsSync(file)) generatedSecret = readFileSync(file, 'utf8').trim();
    if (!generatedSecret) {
      generatedSecret = randomBytes(32).toString('hex');
      writeFileSync(file, generatedSecret, { mode: 0o600 });
    }
    return generatedSecret;
  }
};

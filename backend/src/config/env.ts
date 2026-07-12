import dotenv from 'dotenv';

// Load .env before anything else reads process.env
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

interface EnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  corsOrigins: string[];
  trustProxy: boolean;
}

const fail = (message: string): never => {
  // Intentionally loud: refuse to boot with an unsafe/incomplete configuration.
  // eslint-disable-next-line no-console
  console.error(`FATAL ENV CONFIG ERROR: ${message}`);
  process.exit(1);
};

const requireVar = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    if (isTest) {
      // Unit tests mock the database and sign their own tokens.
      return `test-${name.toLowerCase()}`;
    }
    return fail(`Required environment variable ${name} is not set.`);
  }
  return value;
};

const PLACEHOLDER_PATTERNS = [/replace_with/i, /changeme/i, /example/i, /your[-_]?secret/i];

const requireSecret = (name: string): string => {
  const value = requireVar(name);
  if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
    return fail(`${name} still contains a placeholder value. Generate a real secret (e.g. openssl rand -hex 32).`);
  }
  if (isProduction && value.length < 32) {
    return fail(`${name} must be at least 32 characters in production.`);
  }
  return value;
};

const parseOrigins = (): string[] => {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === '') {
    if (isProduction) {
      return fail('CORS_ORIGIN is required in production (comma-separated list of exact allowed origins).');
    }
    return ['http://localhost:3000'];
  }
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    return fail('CORS_ORIGIN must list exact origins; wildcard "*" is not allowed.');
  }
  return origins;
};

export const env: EnvConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 4000,
  databaseUrl: requireVar('DATABASE_URL'),
  jwtSecret: requireSecret('JWT_SECRET'),
  jwtRefreshSecret: requireSecret('JWT_REFRESH_SECRET'),
  corsOrigins: parseOrigins(),
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',
};

if (env.jwtSecret === env.jwtRefreshSecret) {
  fail('JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
}

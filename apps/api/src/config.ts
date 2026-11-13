import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 优先级：进程环境变量 > apps/api/.env > 仓库根 .env（dotenv 不覆盖已存在的值）
loadEnv({ path: path.resolve(__dirname, '../.env'), quiet: true });
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function list(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

export const env = {
  port: Number(process.env.PORT ?? 8788),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv,
  isProduction,
  /** 后台 web + 扫码 scan 的来源，逗号分隔 */
  corsOrigins: list(process.env.CORS_ORIGIN ?? 'http://localhost:5180,https://localhost:5174'),
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-change-me-jwt-secret-use-long-random-string'),
  cookieSecure: (process.env.COOKIE_SECURE ?? 'false') === 'true',

  /** Google 登录：OAuth Web Client ID（不是密钥） */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  /** 永远是管理员、不会被锁在门外的邮箱（逗号分隔） */
  adminEmails: list(process.env.ADMIN_EMAILS),
  /** 开发期免 Google 登录（仅非 production 生效） */
  devLogin: !isProduction && process.env.DEV_LOGIN === 'true',

  /** local = 写 .data/ 本地文件（干跑）；bigquery = 写 BQ（阶段六） */
  storage: (process.env.STORAGE ?? 'local') as 'local' | 'bigquery',
  dataDir: path.resolve(__dirname, '..', process.env.DATA_DIR ?? '.data'),
  gcpProjectId: process.env.GCP_PROJECT_ID ?? '',
  bqDataset: process.env.BQ_DATASET ?? 'tryon',

  /** 扫码页公开链接前缀，用于生成二维码，如 https://shade.example.com */
  publicScanBaseUrl: (process.env.PUBLIC_SCAN_BASE_URL ?? 'https://localhost:5174').replace(/\/$/, ''),
};

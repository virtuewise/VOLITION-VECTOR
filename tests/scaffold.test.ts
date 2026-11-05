import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const requiredPaths = [
  'apps/web/public-website',
  'apps/web/marketplace',
  'apps/web/individual-workspace',
  'apps/web/business-workspace',
  'apps/web/admin-console',
  'apps/api/identity',
  'apps/api/opportunity',
  'apps/api/marketplace',
  'apps/api/payments',
  'apps/api/intelligence',
  'apps/api/credentials',
  'apps/api/governance',
  'apps/api/communication',
  'apps/mobile',
  'apps/worker',
  'packages/ui',
  'packages/design-system',
  'packages/database',
  'packages/contracts',
  'packages/validation',
  'packages/permissions',
  'packages/payments-sdk',
  'packages/ai-sdk',
  'packages/localization',
  'packages/security',
  'packages/shared',
  'infrastructure/docker',
  'infrastructure/deployment',
  'infrastructure/monitoring',
  'infrastructure/backups',
  'infrastructure/security',
  'governance/privacy',
  'governance/gdpr',
  'governance/ai-governance',
  'governance/platform-work',
  'governance/payments',
  'governance/security',
  'governance/accessibility',
  'governance/certifications',
  'docs/product',
  'docs/architecture',
  'docs/api',
  'docs/operations',
  'docs/policies',
  'tests',
];

describe('authoritative repository scaffold', () => {
  it.each(requiredPaths)('%s exists', (path) => {
    expect(existsSync(resolve(root, path))).toBe(true);
  });
});

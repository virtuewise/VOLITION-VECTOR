/** PostgreSQL is the authoritative transactional store; Redis is not. */
export type DatabaseHealth = 'unknown' | 'healthy' | 'unhealthy';

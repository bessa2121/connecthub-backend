import { createMemoryPersistence } from './memory/repositories.js';
import { createPostgresPersistence } from './postgres/repositories.js';

/** Escolhe o adaptador de persistência: Postgres quando há DATABASE_URL, memória caso contrário. */
export const createPersistence = (databaseUrl) => (databaseUrl ? createPostgresPersistence(databaseUrl) : createMemoryPersistence());

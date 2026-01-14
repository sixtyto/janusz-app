import os from 'node:os'
import path from 'node:path'

export const DEFAULT_CONFIG = {
  baseDir: path.join(os.tmpdir(), 'janusz-repos'),
  staleWorkTreeAgeMs: 60 * 60 * 1000,
  lockTimeoutMs: 5 * 60 * 1000,
  cleanupIntervalMs: 15 * 60 * 1000,
}

export const LOCK_FILE_EXTENSION = '.lock'

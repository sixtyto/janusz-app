export interface LockMetadata {
  pid: number
  createdAt: number
  jobId: string
  hostname: string
}

export interface WorkTreeMetadata {
  jobId: string
  repoFullName: string
  createdAt: number
  pid: number
}

export interface CleanupResult {
  orphanedWorkTreesCleaned: number
  staleLocksCleaned: number
  bytesFreed: number
  errors: Error[]
}

export interface CacheConfig {
  baseDir: string
  staleWorkTreeAgeMs: number
  lockTimeoutMs: number
  cleanupIntervalMs: number
  maxCacheSizeBytes?: number
}

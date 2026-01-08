import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'

let databaseInstance: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useDatabase() {
  if (databaseInstance) {
    return databaseInstance
  }

  const config = useRuntimeConfig()
  const connectionString = config.databaseUrl

  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured')
  }

  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  databaseInstance = drizzle(client, { schema })
  return databaseInstance
}

import process from 'node:process'
import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

export default defineConfig({
  out: './drizzle',
  schema: './server/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // eslint-disable-next-line ts/no-unsafe-member-access
    url: process.env.DATABASE_URL as string,
  },
})

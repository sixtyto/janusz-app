import process from 'node:process'
import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

export default defineConfig({
  out: './drizzle',
  schema: './server/database/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {

    url: process.env.DATABASE_URL ?? '',
  },
})

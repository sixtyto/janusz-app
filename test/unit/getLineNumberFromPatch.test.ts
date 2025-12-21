import { describe, expect, it } from 'vitest'
import { getLineNumberFromPatch } from '../../server/utils/getLineNumberFromPatch'

describe('getLineNumberFromPatch', () => {
  const patch = `@@ -1,4 +1,5 @@
-const a = 1;
+const a = 2; // changed
 const b = 2;
+const c = 3; // added
 const d = 4;`

  it('finds line number for exact added line', () => {
    expect(getLineNumberFromPatch(patch, 'const a = 2; // changed')).toEqual({ line: 1, side: 'RIGHT' })
  })

  it('finds line number for exact context line', () => {
    expect(getLineNumberFromPatch(patch, 'const b = 2;')).toEqual({ line: 2, side: 'RIGHT' })
  })

  it('finds line number for second added line', () => {
    expect(getLineNumberFromPatch(patch, 'const c = 3; // added')).toEqual({ line: 3, side: 'RIGHT' })
  })

  it('prioritizes added line over context line when ambiguous', () => {
    const ambiguousPatch = `@@ -1,1 +1,2 @@
 const x = 1;
+const x = 1;`
    expect(getLineNumberFromPatch(ambiguousPatch, 'const x = 1;')).toEqual({ line: 2, side: 'RIGHT' })
  })

  it('returns null for non-existent snippet', () => {
    expect(getLineNumberFromPatch(patch, 'const z = 999;')).toBeNull()
  })

  it('returns valid LEFT side match for deleted lines', () => {
    expect(getLineNumberFromPatch(patch, 'const a = 1;')).toEqual({ line: 1, side: 'LEFT' })
  })

  describe('variable length patches', () => {
    function generatePatch(lines: number): string {
      let patch = '@@ -1,1 +1,1 @@\n'
      for (let i = 0; i < lines; i++) {
        if (i % 2 === 0) {
          patch += `+const line${i} = "value";\n`
        }
        else {
          patch += ` const line${i} = "value";\n`
        }
      }
      return patch
    }

    it('handles small patch (10 lines)', () => {
      const smallPatch = generatePatch(10)
      expect(getLineNumberFromPatch(smallPatch, 'const line0 = "value";')).toEqual({ line: 1, side: 'RIGHT' })
      expect(getLineNumberFromPatch(smallPatch, 'const line9 = "value";')).toEqual({ line: 10, side: 'RIGHT' })
    })

    it('handles medium patch (100 lines)', () => {
      const mediumPatch = generatePatch(100)
      expect(getLineNumberFromPatch(mediumPatch, 'const line50 = "value";')).toEqual({ line: 51, side: 'RIGHT' })
    })

    it('handles large patch (2000 lines)', () => {
      const largePatch = generatePatch(2000)
      expect(getLineNumberFromPatch(largePatch, 'const line1998 = "value";')).toEqual({ line: 1999, side: 'RIGHT' })
    })

    it('correctly identifies changed vs context in large patches', () => {
      const largePatch = generatePatch(1000)
      expect(getLineNumberFromPatch(largePatch, 'const line500 = "value";')).toEqual({ line: 501, side: 'RIGHT' })
      expect(getLineNumberFromPatch(largePatch, 'const line501 = "value";')).toEqual({ line: 502, side: 'RIGHT' })
    })
  })

  describe('robust snippet matching', () => {
    const patch = `@@ -1,9 +1,9 @@
 const a = 2;
+const b = 3;
 const c = { foo: 'bar' };
+const d = [1, 2, 3];
+const e = (x, y) => x + y;
+if (a > 0) { console.log('ok'); }
+const f: number = 10;
+const g = "string with ; semicolon";
+const h = { a: 1, b: 2 };`

    it('matches snippet despite missing semicolon', () => {
      expect(getLineNumberFromPatch(patch, 'const a = 2')).toEqual({ line: 1, side: 'RIGHT' })
    })

    it('matches snippet despite removed spaces around operator', () => {
      expect(getLineNumberFromPatch(patch, 'const b=3;')).toEqual({ line: 2, side: 'RIGHT' })
    })

    it('matches snippet despite extra spaces change', () => {
      expect(getLineNumberFromPatch(patch, 'const   b  =   3;')).toEqual({ line: 2, side: 'RIGHT' })
    })

    it('matches complex object snippet despite formatting differences', () => {
      expect(getLineNumberFromPatch(patch, 'const c={foo:\'bar\'}')).toEqual({ line: 3, side: 'RIGHT' })
    })

    it('matches array with loose spacing', () => {
      expect(getLineNumberFromPatch(patch, 'const d = [ 1 , 2 , 3 ]')).toEqual({ line: 4, side: 'RIGHT' })
    })

    it('matches array with tight spacing', () => {
      expect(getLineNumberFromPatch(patch, 'const d=[1,2,3]')).toEqual({ line: 4, side: 'RIGHT' })
    })

    it('matches arrow function with tight spacing', () => {
      expect(getLineNumberFromPatch(patch, 'const e=(x,y)=>x+y')).toEqual({ line: 5, side: 'RIGHT' })
    })

    it('matches arrow function with loose spacing', () => {
      expect(getLineNumberFromPatch(patch, 'const e = ( x , y ) => x + y')).toEqual({ line: 5, side: 'RIGHT' })
    })

    it('matches if statement with different spacing', () => {
      expect(getLineNumberFromPatch(patch, 'if(a>0){console.log(\'ok\')}')).toEqual({ line: 6, side: 'RIGHT' })
    })

    it('matches typescript type annotation tight', () => {
      expect(getLineNumberFromPatch(patch, 'const f:number=10')).toEqual({ line: 7, side: 'RIGHT' })
    })

    it('matches typescript type annotation loose', () => {
      expect(getLineNumberFromPatch(patch, 'const f : number = 10')).toEqual({ line: 7, side: 'RIGHT' })
    })

    it('matches string containing semicolon correctly (normalized)', () => {
      expect(getLineNumberFromPatch(patch, 'const g = "string with ; semicolon"')).toEqual({ line: 8, side: 'RIGHT' })
    })

    it('matches object properties with different spacing', () => {
      expect(getLineNumberFromPatch(patch, 'const h = {a:1, b:2}')).toEqual({ line: 9, side: 'RIGHT' })
      expect(getLineNumberFromPatch(patch, 'const h={ a : 1 , b : 2 }')).toEqual({ line: 9, side: 'RIGHT' })
    })
  })

  describe('multi-line snippet matching', () => {
    const patch = `@@ -10,6 +10,6 @@
-    await setUserSession(event, { user })
+    await setUserSession(event, {
+      user,
+      secure: {
+        githubToken: tokens.access_token,
+      },
+    })`

    it('matches exact multi-line snippet', () => {
      const snippet = `    await setUserSession(event, {
      user,
      secure: {
        githubToken: tokens.access_token,
      },
    })`
      expect(getLineNumberFromPatch(patch, snippet)).toEqual({ line: 15, start_line: 10, side: 'RIGHT' })
    })

    it('matches multi-line snippet with context', () => {
      const patchWithContext = `@@ -1,5 +1,6 @@
 const a = 1;
 const b = 2;
+const c = 3;
 const d = 4;
 const e = 5;`

      const snippet = `const b = 2;
const c = 3;
const d = 4;`
      expect(getLineNumberFromPatch(patchWithContext, snippet)).toEqual({ line: 4, start_line: 2, side: 'RIGHT' })
    })

    it('matches multi-line snippet even with extra whitespace in snippet', () => {
      const snippet = `    await setUserSession(event, {
          user,
          secure: {
            githubToken: tokens.access_token,
          },
        })`
      expect(getLineNumberFromPatch(patch, snippet)).toEqual({ line: 15, start_line: 10, side: 'RIGHT' })
    })

    it('matches multi-line snippet containing blank lines', () => {
      const patchWithBlank = `@@ -1,5 +1,6 @@
 const a = 1;
 
+const b = 2;
 
 const c = 3;`
      const snippet = `const a = 1;
      
      const b = 2;`

      expect(getLineNumberFromPatch(patchWithBlank, snippet)).toEqual({ line: 3, start_line: 1, side: 'RIGHT' })
    })

    it('returns null for partial match where start matches but end does not', () => {
      const patchForFail = `@@ -1,3 +1,3 @@
 const a = 1;
 const b = 2;
+const c = 3;`
      const snippet = `const a = 1;
const b = 99;`

      expect(getLineNumberFromPatch(patchForFail, snippet)).toBeNull()
    })

    it('prioritizes match with more added lines when multiple matches exist', () => {
      const complexPatch = `@@ -1,2 +1,4 @@
 const a = 1;
 const a = 1;
+const a = 1;`

      expect(getLineNumberFromPatch(complexPatch, 'const a = 1;')).toEqual({ line: 3, side: 'RIGHT' })
    })
  })

  describe('cross-file/chunk safety (edge cases)', () => {
    it('does NOT match snippet spanning across two different files', () => {
      const multiFilePatch = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,1 @@
+const endOfFileA = 1;
diff --git a/b.ts b/b.ts
--- b/b.ts
+++ b/b.ts
@@ -1,1 +1,1 @@
+const startOfFileB = 1;`

      const snippet = `const endOfFileA = 1;
const startOfFileB = 1;`

      expect(getLineNumberFromPatch(multiFilePatch, snippet)).toBeNull()
    })
  })

  describe('from logs', () => {
    it('should handle the problematic case with fastify declaration', () => {
      const patch = `@@ -1,7 +1,25 @@
+import process from 'node:process'
+import fastifyEnv from ' @fastify/env'
 import Fastify from 'fastify'
 import fastifyRawBody from 'fastify-raw-body'
+import { logger } from './logger'
+import { AuthError } from './middleware/auth'
+import redisPlugin from './plugins/redis'
 import { healthRoutes } from './routes/health'
 import { webhookRoutes } from './routes/webhook'
+import { configSchema } from './schemas/config'
+
+declare module 'fastify' {
+  interface FastifyInstance {
+    config: {
+      PORT: string
+      HOST: string
+      GITHUB_APP_ID: string
+      GITHUB_WEBHOOK_SECRET: string
+      REDIS_URL: string
+    }
+  }
+}
+
+async function buildApp() {
+  const fastify = Fastify({`

      const snippet = `declare module 'fastify' {
  interface FastifyInstance {
    config: {`

      const result = getLineNumberFromPatch(patch, snippet)
      expect(result).not.toBeNull()
      expect(result?.line).toBe(14)
    })

    it('should handle escaped newlines in snippet (common LLM output issue)', () => {
      const patch = `@@ -1,2 +1,4 @@
 const a = 1;
+const b = 2;
+const c = 3;
 const d = 4;`
      const snippet = 'const b = 2;\nconst c = 3;'
      const result = getLineNumberFromPatch(patch, snippet)
      expect(result).toEqual({ line: 3, start_line: 2, side: 'RIGHT' })
    })

    it('should handle redis plugin case (nested object)', () => {
      const patch = `diff --git a/src/plugins/redis.ts b/src/plugins/redis.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/plugins/redis.ts
@@ -0,0 +1,29 @@
+import type { FastifyPluginAsync } from 'fastify'
+import { Queue } from 'bullmq'
+import fp from 'fastify-plugin'
+
+declare module 'fastify' {
+  interface FastifyInstance {
+    queue: Queue
+  }
+}
+
+const redisPlugin: FastifyPluginAsync = async (fastify) => {
+  const prReviewQueue = new Queue('pr-review', {
+    connection: {
+      url: fastify.config.REDIS_URL,
+    },
+    defaultJobOptions: {
+      removeOnComplete: true,
+      removeOnFail: false,
+    },
+  })
+
+  fastify.decorate('queue', prReviewQueue)
+
+  fastify.addHook('onClose', async () => {
+    await prReviewQueue.close()
+  })
+}
+
+export default fp(redisPlugin)`

      const snippet = 'connection: {\\n      url: fastify.config.REDIS_URL,\\n    },'

      const result = getLineNumberFromPatch(patch, snippet)

      expect(result).toEqual({ line: 15, start_line: 13, side: 'RIGHT' })
    })

    it('should find snippet containing literal \\n in regex', () => {
      // Note: \\\\n in template literal becomes \\n (backslash n) in string
      const patch = `@@ -3,11 +3,12 @@ import { Octokit } from ' @octokit/rest'
 
 export function createGitHubClient(installationId: number) {
   const config = useRuntimeConfig()
+  const privateKey = config.githubPrivateKey?.replace(/\\\\n/g, '\\\\n')
   const octokit = new Octokit({
     authStrategy: createAppAuth,
     auth: {
       appId: config.githubAppId,
-      privateKey: config.githubPrivateKey,
+      privateKey,
       installationId,
     },
   })`

      // The snippet should also have \\n (backslash n)
      const snippet = 'const privateKey = config.githubPrivateKey?.replace(/\\\\n/g, \'\\\\n\')'

      const result = getLineNumberFromPatch(patch, snippet)

      expect(result).not.toBeNull()
    })

    it('should handle the problematic case with removed lines (LEFT side)', () => {
      const patch = `@@ -1,17 +1,15 @@
 export default defineEventHandler(async () => {
   const queue = getPrReviewQueue()
-  const [waiting, active, completed, failed, delayed] = await Promise.all([
+  const [waiting, active, failed, delayed] = await Promise.all([
     queue.getWaitingCount(),
     queue.getActiveCount(),
-    queue.getCompletedCount(),
     queue.getFailedCount(),
     queue.getDelayedCount(),
   ])
 
   return {
     waiting,
     active,
-    completed,
     failed,
     delayed,
   } `
      const snippet = 'queue.getCompletedCount(),'

      const result = getLineNumberFromPatch(patch, snippet)
      expect(result).toEqual({ line: 6, side: 'LEFT' })
    })
  })
})

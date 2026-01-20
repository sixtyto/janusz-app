# Janusz App - Deep Dive Audit

## PODSUMOWANIE

| Kategoria | Ocena | Status |
|-----------|-------|--------|
| Architektura | 7/10 | Solidna, deficyty separacji |
| Bezpieczenstwo | 6/10 | Kilka problemow do naprawy |
| Wydajnosc | 6/10 | Istotne problemy |
| Spojnosc modulow | 5/10 | Race conditions, niespojne typy |
| Infrastruktura | 5.5/10 | Brak monitoring, backup, docs |

---

## NAPRAWIONE

### ~~1. Rate limit bypass gdy Redis padnie~~ DONE
**Lokalizacja:** `server/utils/rateLimiter.ts:75-83`

Zmieniono na fail-closed: `allowed: false`, `remaining: 0`

---

### ~~2. JSON.parse bez try-catch~~ DONE
**Lokalizacja:** `server/api/webhook.post.ts:76-81`

Dodano try-catch, zwraca 400 Bad Request przy invalid JSON.

---

### ~~9. Brak rate limiting na API endpoints~~ DONE
**Lokalizacje:**
- `server/api/jobs/index.get.ts`
- `server/api/logs.get.ts`
- `server/api/repositories.get.ts`
- `server/api/dashboard/stats.get.ts`

**Fix:** Dodano rate limiting przez `handleApiRateLimit` (60 req/min).

---

### ~~18. Sequential file reads zamiast parallel~~ DONE
**Lokalizacja:** `server/utils/repoService.ts:39-66`

Zmieniono na `Promise.allSettled()` dla równoległego czytania plików. Poprawia wydajność przy wielu plikach kontekstowych.

---

### ~~22. Cache LRU nie dziala poprawnie~~ DONE
**Lokalizacja:** `server/utils/getUserInstallationIds.ts:38-42`

Dodano `createdAt` timestamp do `CacheEntry`. Usuwanie najstarszego elementu po `createdAt` zamiast polegania na kolejności Map (która nie jest gwarantowana).

---

### ~~26. Hardkodowane Redis keys~~ DONE
**Lokalizacje:**
- `server/utils/useLogger.ts:69` - `janusz:events:${jobId}`
- `server/api/jobs/stream.get.ts:14` - `janusz:events:${jobId}`
- `server/utils/provisionRepo.ts:213` - `janusz:index:${repoFullName}`
- `server/api/webhook.post.ts:28,64` - `webhook:ratelimit`, `webhook:delivery`

Utworzono `shared/constants/redisKeys.ts` z funkcjami `JOB_EVENTS()`, `REPO_INDEX()`, `WEBHOOK_DELIVERY()`. Zaktualizowano wszystkie pliki.

---

### ~~29. Hardkodowane magiczne liczby~~ DONE
**Lokalizacje:**
- `server/utils/provisionRepo.ts:118` - `500 * 1024` (file size limit)
- `server/utils/repoService.ts:56` - `500 * 1024`
- `server/utils/contextFormatters.ts:4` - `MAX_CHARS = 250_000`

Utworzono `shared/constants/limits.ts` z `MAX_FILE_SIZE_BYTES`, `MAX_CONTEXT_CHARS`. Zaktualizowano wszystkie pliki.

---

## KRYTYCZNE

### ~~3. Race condition: webhook -> queue -> DB~~ DONE
**Lokalizacje:**
- `server/api/webhook.post.ts:159-199`
- `server/utils/jobService.ts:37-48`

Rozwiazanie:
1. `createJob()` zwraca boolean (czy faktycznie wstawiono rekord)
2. Najpierw DB insert, potem queue.add()
3. Rollback TYLKO jesli `wasInserted === true` (nie usuwamy rekordow innych requestow)
4. Osobna obsluga bledow dla DB i queue

---

### ~~4. Logger fire-and-forget~~ WON'T FIX
**Lokalizacja:** `server/utils/useLogger.ts:69,90`

Fire-and-forget jest OK - DB i Redis na tym samym VPS/Coolify, jeśli jedno padnie to cała apka nie działa.

---

### ~~5. TODO w kodzie produkcyjnym - CRITICAL = NEUTRAL~~ WON'T FIX
**Lokalizacja:** `server/utils/reviewService.ts:117-119`

Świadoma decyzja - AI generuje false positives (np. niepotrzebne optional chaining), FAILURE blokowałoby merge bez sensu. NEUTRAL pozwala devowi zdecydować.

---

### ~~6. JobStatus.UNKNOWN nie istnieje w DB~~ DONE
**Lokalizacja:**
- `shared/types/JobStatus.ts:9` - enum zawiera UNKNOWN
- `server/database/schema.ts:3-11` - brak 'unknown' w pgEnum

Usunięto UNKNOWN z TypeScript enum (martwy kod, nigdzie nie używany) i poprawiono interface EnrichedJob.

---

### ~~41. Prompt Injection Risk~~ WON'T FIX
**Lokalizacja:** `server/utils/januszPrompts.ts`, `server/utils/aiService.ts`

System instruction już oddzielony od user content na poziomie API. Teoretyczny atak = pusta tablica / błąd = atak na siebie samego. Accepted risk.

---

## WYSOKIE

### ~~7. Slabe haslo sesji~~ WON'T FIX
**Lokalizacja:** `.env:6`

Hasło sesji nie jest w repo, tylko w zmiennych środowiskowych na produkcji.

---

### ~~8. Logowanie wrazliwych danych~~ FALSE POSITIVE WON'T FIX
**Lokalizacje:**
- `server/utils/useLogger.ts:106` - loguje cale meta object
- `server/utils/provisionRepo.ts:233` - loguje caly index repo

**Analiza:** RequestError request/response są już usuwane w safeMeta.clone(). Meta jest ręcznie określana, nie zawiera tokenów. Clone URL nie jest bezpośrednio logowany. Issue #8 to false positive.

---

### ~~10. Token w clone URL moze wyciec~~ WON'T FIX
**Lokalizacja:** `server/utils/repoService.ts:24`

**Analiza:** Token jest tylko w lokalnej zmiennej i używany w `git clone`. Nigdzie nie logowany. FALSE POSITIVE.

---

### ~~11. Path traversal - tylko warn, nie throw~~ WON'T FIX
**Lokalizacja:** `server/utils/repoService.ts:40-44`

**Analiza:** AI zwraca ścieżki z indeksu, który zawiera tylko pliki z repozytorium (znormalizowane przez `path.relative()`). Na końcu jest filtracja przez `Object.prototype.hasOwnProperty.call(index, filename)`. Path traversal check to defense in depth. FALSE POSITIVE.

---

### 12. Brak CSRF protection na POST endpoints
**Lokalizacje:**
- `server/api/jobs/retry.post.ts`
- `server/api/webhook.post.ts`

**Fix:** Implementowac CSRF tokens (Nuxt ma built-in wsparcie).

---

### ~~13. Brak security headers (CSP, X-Frame-Options)~~ WON'T FIX
**Lokalizacja:** Cala aplikacja

routeRules w Nuxt 4 jest experimental - poczekamy na stabilną wersję.

---

## PERFORMANCE

### ~~14. Deep watcher na liveLogs~~ WON'T FIX
**Lokalizacja:** `app/pages/jobs.vue:105-111`

Live logi wylecą w przyszłości.

---

### ~~15. Client-side filtering logow~~ DONE
**Lokalizacja:** `app/pages/logs.vue:39-68`

Pobiera 100 logow i filtruje na kliencie.

**Fix:** Dodano query parametry do API (`?page=...&limit=...&service=...&level=...`).
Backend zwraca `{ logs: LogEntry[], total: number, page: number, limit: number }`.
Frontend używa reactive query w `useFetch` - filtrowanie i paginacja na server-side.

---

### 16. N+1 API calls w repositories
**Lokalizacja:** `server/api/repositories.get.ts:24-31`

Osobny API call per instalacja GitHub.

**Fix:** Cache wynikow na 5 minut.

---

### 17. Memory leak - EventEmitter listeners
**Lokalizacja:** `server/utils/redisSubscriptionManager.ts`

`subscribeToChannel` moze dodac duplikaty listenerow.

**Fix:** Sprawdzaj czy listener juz istnieje przed dodaniem.

---

### ~~18. Sequential file reads zamiast parallel~~ DONE
**Lokalizacja:** `server/utils/repoService.ts:39-66`

Zmieniono na `Promise.allSettled()` dla równoległego czytania plików. Poprawia wydajność przy wielu plikach kontekstowych.

---

### ~~19. Brak timeout na Gemini API~~ WON'T FIX
**Lokalizacja:** `server/utils/aiService.ts:20-60`

Request do Gemini moze wisiec w nieskonczonosc.

WONT FIX - timeouty są obsługiwane przez infrastrukturę VPS.

---

### ~~20. Brak indexu na job_id w logach~~ DONE
**Lokalizacja:** `server/database/schema.ts:37-49`

Dodano `logs_job_id_idx` + zamieniono osobne indexy na composite `logs_installation_id_created_at_idx`.

---

### ~~21. Brak indexow na tabeli jobs~~ DONE
**Lokalizacja:** `server/database/schema.ts`

Dodano composite `jobs_installation_id_created_at_idx` + `jobs_status_idx`.

---

### ~~22. Cache LRU nie dziala poprawnie~~ DONE
**Lokalizacja:** `server/utils/getUserInstallationIds.ts:38-42`

Dodano `createdAt` timestamp do `CacheEntry`. Usuwanie najstarszego elementu po `createdAt` zamiast polegania na kolejności Map (która nie jest gwarantowana).

---

### 23. Brak limitu plikow przy indeksowaniu
**Lokalizacja:** `server/utils/provisionRepo.ts:183-208`

Duze repo moze miec tysiace plikow - brak early exit.

**Fix:** Dodaj `MAX_FILES_TO_INDEX = 10000` i przerwij skanowanie.

---

### 42. Wyczerpanie miejsca na dysku (os.tmpdir)
**Lokalizacja:** `server/utils/provisionRepo.ts`

Klonowanie wielu repozytoriów może zapchać dysk.

**Fix:** Agresywne czyszczenie starych repozytoriów lub limit rozmiaru katalogu tmp.

---

## ARCHITEKTURA

### 24. reviewService.ts - za duzo odpowiedzialnosci
**Lokalizacja:** `server/utils/reviewService.ts` (173 linie)

Miesza: orchestration + GitHub API + AI calling.

**Fix:** Rozbic na mniejsze funkcje/serwisy.

---

### 25. Brak Dependency Injection
62 importow `useDatabase()`, `getRedisClient()` rozsianych po kodzie.

**Fix:** Rozwazyc DI container lub przekazywanie zaleznosci przez parametry.

---

### ~~26. Hardkodowane Redis keys~~ DONE
**Lokalizacje:**
- `server/utils/useLogger.ts:69` - `janusz:events:${jobId}`
- `server/api/jobs/stream.get.ts:14` - `janusz:events:${jobId}`
- `server/utils/provisionRepo.ts:213` - `janusz:index:${repoFullName}`
- `server/api/webhook.post.ts:28,64` - `webhook:ratelimit`, `webhook:delivery`

Utworzono `shared/constants/redisKeys.ts` z funkcjami `JOB_EVENTS()`, `REPO_INDEX()`, `WEBHOOK_DELIVERY()`. Zaktualizowano wszystkie pliki.

---

### ~~27. Niespojne nazewnictwo prNumber vs pullRequestNumber~~ DONE
**Lokalizacje:**
- DB: `pullRequestNumber` (snake_case)
- Job data: `prNumber` (camelCase)
- Konwersja w `server/utils/jobService.ts:129`

**Fix:** Ujednolicic nazewnictwo w `JobDto` na `prNumber`.

---

### ~~28. Niespojne formaty timestamps~~ DONE
- `shared/types/JobDto.ts:16` - `timestamp: number` (milliseconds)
- `shared/types/LogEntry.ts:12` - `timestamp: string` (ISO)

**Fix:** Ustandaryzowac (ISO string wszedzie).

---

### 30. attemptsStarted/attemptsMade zawsze 0
**Lokalizacja:** `server/utils/jobService.ts:132-134`

```typescript
attemptsStarted: 0,  // Zawsze 0, nie z bazy
attemptsMade: 0,     // Zawsze 0, nie z bazy
```

**Fix:** Pobierac rzeczywiste wartosci z BullMQ lub usunac te pola.

---

### ~~43. Niespójność typów JobDto vs EnrichedJob~~ DONE
**Lokalizacja:** `server/utils/jobService.ts`

Ryzyko błędów hydracji na frontendzie.

**Fix:** Ujednolicić interfejsy w `shared/types`.

---

## INFRASTRUKTURA

### 31. Brak testow integracyjnych/E2E
- 48% pokrycia unit testami
- 0% testow E2E
- 0% testow Vue komponentow

**Fix:** Dodac Playwright dla critical flows.

---

### 32. Brak dokumentacji API (OpenAPI/Swagger)
- 0 komentarzy JSDoc w serwerze
- Brak OpenAPI spec

**Fix:** Dodac OpenAPI spec + Swagger UI.

---

### 33. Brak error tracking (Sentry/DataDog)
**Fix:** Zintegrowac Sentry lub DataDog.

---

### ~~34. Health check zbyt prosty~~ WON'T FIX
**Lokalizacja:** `server/api/health.get.ts`

Jest healthcheck, wystarczy.

---

### ~~35. Brak backup strategy dla PostgreSQL~~ WON'T FIX

Backup to kwestia infrastruktury (Coolify), nie aplikacji.

---

### ~~36. CI/CD - brak build step~~ WON'T FIX
**Lokalizacja:** `.github/workflows/ci.yml`

Healthcheck po buildzie blokuje deploy - build error i tak nie przejdzie.

---

### 37. Brak error boundaries w Vue
**Lokalizacja:** `app/app.vue`

**Fix:** Dodac global error handler i error boundary components.

---

### 44. Brak testów dla kluczowej logiki (Parser/Process)
**Lokalizacja:** `server/utils/treeSitterParser.ts`, `server/utils/processJob.ts`

Skomplikowana logika bez pokrycia testami.

**Fix:** Dodać dedykowane testy jednostkowe.

---

## NISKIE

### ~~38. Number.parseInt bez radix~~ WON'T FIX
**Lokalizacja:** `server/api/repositories.get.ts:21`

Nitpick.

---

### ~~39. Silent error w useJobStream~~ WON'T FIX
**Lokalizacja:** `app/composables/useJobStream.ts:27`

```typescript
catch {
  // silently ignore failed items
}
```

Stream wyleci z systemu w przyszłości (Issue #14).

---

### ~~40. Regex na repo name - brak limitu dlugosci~~ DONE
**Lokalizacja:** `server/utils/provisionRepo.ts:25`

Obecny regex jest OK, ale mozna dodac limity dlugosci zgodne z GitHub (39/100 znakow).

**Fix:** Zaktualizowano regex na `/^[\w-]{1,39}\/[\w.-]{1,100}$/`.

---

## PODSUMOWANIE PRIORYTETOW

| Priorytet | Issues | Status |
|-----------|--------|--------|
| NAPRAWIONE | 7 | DONE |
| KRYTYCZNE | 4 | TODO |
| WYSOKIE | 4 | TODO |
| PERFORMANCE | 8 | TODO |
| ARCHITEKTURA | 6 | TODO |
| INFRASTRUKTURA | 8 | TODO |
| NISKIE | 3 | TODO |
| WONT FIX | 6 | FALSE POSITIVE |

### Kolejnosc dzialania:
1. ~~Fix race condition webhook -> DB (issue #3)~~ DONE
2. Fix logger fire-and-forget (issue #4)
3. Fix TODO CRITICAL=NEUTRAL (issue #5)
4. Dodaj JobStatus.UNKNOWN do DB (issue #6)
5. Dodaj rate limiting na API (issue #9)
6. Dodaj security headers (issue #13)
7. Fix deep watcher (issue #14)
8. Dodaj indexy do DB (issues #20, #21)
9. Fix Prompt Injection (issue #41)
10. Reszta wedlug uznania

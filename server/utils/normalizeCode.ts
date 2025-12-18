export function normalizeCode(code: string): string {
  return code
    .replace(/\s+/g, ' ')
    .replace(/\s*([=+\-*/(){},:;<>[\]])\s*/g, '$1')
    .replace(/;/g, '')
    .trim()
}

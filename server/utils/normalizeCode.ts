export function normalizeCode(code: string) {
  return code
    .replace(/\s+/g, ' ')
    .replace(/\s*([=+\-*/(){},:;<>[\]])\s*/g, '$1')
    .replace(/;/g, '')
    .trim()
}

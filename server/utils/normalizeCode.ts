const WHITESPACE_PATTERN = /\s+/g
const OPERATOR_PADDING_PATTERN = /\s*([=+\-*/(){},:;<>[\]])\s*/g
const SEMICOLON_PATTERN = /;/g

export function normalizeCode(code: string) {
  return code
    .replace(WHITESPACE_PATTERN, ' ')
    .replace(OPERATOR_PADDING_PATTERN, '$1')
    .replace(SEMICOLON_PATTERN, '')
    .trim()
}

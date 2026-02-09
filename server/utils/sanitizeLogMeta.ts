export function sanitizeLogMeta(meta: Record<string, unknown> | undefined | null): Record<string, unknown> | undefined | null {
  if (!meta) {
    return meta
  }

  // Shallow copy to avoid mutation of the original object
  const sanitized = { ...meta }

  // If there's an error object, sanitize it
  if (sanitized.error && typeof sanitized.error === 'object') {
    // Create a copy of the error object to avoid mutation
    const safeError = { ...(sanitized.error as Record<string, unknown>) }

    // Remove the stack trace
    delete safeError.stack

    sanitized.error = safeError
  }

  return sanitized
}

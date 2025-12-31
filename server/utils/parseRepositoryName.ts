export function parseRepositoryName(fullName: string) {
  const parts = fullName.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw createError({
      statusCode: 400,
      message: `Invalid repository name format: ${fullName}. Expected "owner/repo".`,
    })
  }
  return { owner: parts[0], repo: parts[1] }
}

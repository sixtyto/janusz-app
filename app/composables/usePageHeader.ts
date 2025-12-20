export function usePageHeader() {
  const title = useState<string>('header-title', () => '')

  const setHeader = (newTitle: string) => {
    title.value = newTitle
  }

  return {
    title,
    setHeader,
  }
}

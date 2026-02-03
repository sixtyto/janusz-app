export interface Repository {
  id: number
  name: string
  fullName: string
  description: string | null
  language: string | null
  isPrivate: boolean
}

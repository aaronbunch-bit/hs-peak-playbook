export type SiteUser = {
  email: string
  jwt: () => Promise<string>
}

let tokenGetter: (() => Promise<string | null>) | null = null

export function setAccessTokenGetter(fn: (() => Promise<string | null>) | null): void {
  tokenGetter = fn
}

export function getSiteAccessToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : Promise.resolve(null)
}

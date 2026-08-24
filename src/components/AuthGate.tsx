import { useEffect, useState } from 'react'
import { setAccessTokenGetter, type SiteUser } from '../lib/auth'

type IdentityApi = {
  init: (opts?: object) => void
  open: (tab?: 'login' | 'signup') => void
  close: () => void
  currentUser: () => SiteUser | null
  on: (event: string, cb: (user: SiteUser | null) => void) => void
  off: (event: string, cb: (user: SiteUser | null) => void) => void
  logout: () => Promise<void> | void
}

declare global {
  interface Window {
    netlifyIdentity?: IdentityApi
  }
}

const DOMAIN_LIST = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS as string | undefined) ?? 'varsitytutors.com'
const IDENTITY_API = '/.netlify/identity'

function allowedDomains(): string[] {
  return DOMAIN_LIST.split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

export function emailAllowed(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1]
  return Boolean(domain && allowedDomains().includes(domain))
}

function setTokenGetter(user: SiteUser | null) {
  setAccessTokenGetter(
    user
      ? async () => {
          try {
            return await user.jwt()
          } catch {
            return null
          }
        }
      : null,
  )
}

let identityInited = false

async function identityAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${IDENTITY_API}/settings`)
    return res.ok
  } catch {
    return false
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const host = typeof window === 'undefined' ? '' : window.location.hostname
  const requireAuth = import.meta.env.PROD && host !== 'localhost' && host !== '127.0.0.1'
  const [user, setUser] = useState<SiteUser | null>(null)
  const [ready, setReady] = useState(!requireAuth)
  const [wrongDomain, setWrongDomain] = useState(false)
  const [identityMissing, setIdentityMissing] = useState(false)

  useEffect(() => {
    if (!requireAuth) {
      setReady(true)
      return
    }

    let cancelled = false
    const identity = window.netlifyIdentity

    const onUser = (next: SiteUser | null) => {
      if (cancelled) return
      if (next?.email && !emailAllowed(next.email)) {
        setWrongDomain(true)
        setUser(null)
        setTokenGetter(null)
        void identity?.logout()
        return
      }
      setWrongDomain(false)
      setUser(next)
      setTokenGetter(next)
    }

    const markReady = (next: SiteUser | null) => {
      onUser(next)
      setReady(true)
    }

    const onInit = (next: SiteUser | null) => markReady(next)
    const onLogin = (next: SiteUser | null) => {
      const hash = window.location.hash
      if (/access_token=|invite_token=|confirmation_token=/.test(hash)) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
      }
      onUser(next)
      identity?.close()
    }
    const onLogout = () => onUser(null)

    void (async () => {
      const enabled = await identityAvailable()
      if (cancelled) return
      if (!enabled || !identity) {
        setIdentityMissing(true)
        setReady(true)
        return
      }

      identity.on('init', onInit)
      identity.on('login', onLogin)
      identity.on('logout', onLogout)

      if (!identityInited) {
        identityInited = true
        identity.init({ APIUrl: `${window.location.origin}${IDENTITY_API}` })
      } else {
        markReady(identity.currentUser())
      }

      window.setTimeout(() => {
        if (!cancelled) markReady(identity.currentUser())
      }, 2500)
    })()

    return () => {
      cancelled = true
      identity?.off('init', onInit)
      identity?.off('login', onLogin)
      identity?.off('logout', onLogout)
    }
  }, [requireAuth])

  const signIn = () => {
    window.netlifyIdentity?.open('login')
  }

  if (!requireAuth) return children
  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-slate-500">Checking Google sign-in…</div>
    )
  }
  if (identityMissing) {
    return (
      <GateShell>
        <h1 className="text-2xl font-semibold text-slate-900">Google sign-in is not on yet</h1>
        <p className="mt-3 text-sm text-slate-600">
          In Netlify open this site → Project configuration → Identity → Enable Identity. Then Registration →
          External providers → enable Google. Invite-only is safest. This site only admits{' '}
          {allowedDomains().join(', ')} accounts.
        </p>
      </GateShell>
    )
  }
  if (!user) {
    return (
      <GateShell>
        <h1 className="text-2xl font-semibold text-slate-900">HS Peak Playbook</h1>
        <p className="mt-3 text-sm text-slate-600">
          Sign in with your Varsity Tutors Google account to open the playbook.
        </p>
        {wrongDomain && (
          <p className="mt-2 text-sm text-rose-600">
            That Google account isn’t on {allowedDomains().join(' or ')}. Use your work account.
          </p>
        )}
        <button
          type="button"
          onClick={signIn}
          className="mt-6 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Continue with Google
        </button>
      </GateShell>
    )
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={() => void window.netlifyIdentity?.logout()}
        className="fixed right-4 bottom-4 z-30 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 hover:text-slate-800"
      >
        Sign out {user.email}
      </button>
    </>
  )
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <div className="max-w-md rounded-3xl border border-white/80 bg-white/90 p-8 shadow-sm shadow-slate-200/80">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Varsity Tutors</p>
        {children}
      </div>
    </div>
  )
}

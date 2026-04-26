'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from './types'
import { clearCurrentUser, getCurrentUser, login as doLogin, logout as doLogout } from './store'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const currentUser = getCurrentUser()
      if (!currentUser) {
        if (!cancelled) {
          setUser(null)
          setIsLoading(false)
        }
        return
      }

      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) {
          clearCurrentUser()
          if (!cancelled) setUser(null)
          return
        }
        if (!cancelled) setUser(currentUser)
      } catch {
        clearCurrentUser()
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (username: string, password: string): Promise<boolean> => {
    const loggedInUser = await doLogin(username, password)
    if (loggedInUser) {
      setUser(loggedInUser)
      return true
    }
    return false
  }

  const logout = () => {
    doLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

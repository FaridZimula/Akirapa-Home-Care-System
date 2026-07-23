'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CARE_COORDINATOR' | 'CAREGIVER' | 'FAMILY_MEMBER';
  phoneNumber?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, role?: string) => Promise<boolean>;
  logout: (isTimeout?: boolean) => Promise<void>;
  triggerAudit: (action: string, details: string, outcome: 'SUCCESS' | 'FAILURE') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  // Load session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }
      } catch (err) {
        console.error('Failed to load authentication session:', err);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  // Idle timeout tracking
  useEffect(() => {
    if (!user) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const handleIdleTimeout = () => {
      console.warn('User session timed out due to inactivity.');
      logout(true);
    };

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(handleIdleTimeout, IDLE_TIMEOUT_MS);
    };

    // Initialize timer
    resetTimer();

    // Listen to user interaction events
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const login = async (email: string, password: string, role?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        router.push('/');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Login request failed:', err);
      return false;
    }
  };

  const logout = async (isTimeout = false) => {
    try {
      if (user && isTimeout) {
        // Record idle timeout audit log on server
        await triggerAudit('SESSION_TIMEOUT', `User session idle expired: ${user.email}`, 'SUCCESS');
      }
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      setUser(null);
      if (isTimeout) {
        router.push('/?reason=timeout');
      } else {
        router.push('/?logout=true');
      }
    }
  };

  const triggerAudit = async (action: string, details: string, outcome: 'SUCCESS' | 'FAILURE') => {
    if (!user) return;
    try {
      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action, details, outcome }),
      });
    } catch (err) {
      console.error('Failed to report client audit action:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, triggerAudit }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

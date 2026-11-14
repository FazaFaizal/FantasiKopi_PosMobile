import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Database } from '../types/database';

type UserRow = Database['public']['Tables']['users']['Row'];

interface AuthContextType {
  session: Session | null;
  user: UserRow | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  /** Muat ulang profil (role/status) dari database. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (data) {
        setUser(data);
      } else if (error?.code === 'PGRST116') {
        // Profil benar-benar tidak ada (mis. akun dihapus Admin).
        console.error('User data not found in public.users', error);
        setUser(null);
      } else {
        // Gangguan jaringan saat memuat ulang: pertahankan profil terakhir.
        console.error('Error fetching user', error);
      }
    } catch (e) {
      console.error('Error fetching user', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserData(session.user.id);
      else setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserData(session.user.id);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const sessionUserId = session?.user.id;
  const refreshUser = useCallback(async () => {
    if (sessionUserId) await fetchUserData(sessionUserId);
  }, [sessionUserId, fetchUserData]);

  // Akun yang dinonaktifkan / diubah role-nya oleh Admin langsung diarahkan ulang
  // saat aplikasi kembali dibuka, tanpa harus keluar-masuk aplikasi.
  useEffect(() => {
    if (!sessionUserId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUser();
    });
    const timer = setInterval(refreshUser, 5 * 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [sessionUserId, refreshUser]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

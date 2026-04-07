import { useState, useEffect, useCallback } from 'react';
import {
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  signOut as cognitoSignOut,
  confirmSignUp as cognitoConfirm,
  getCurrentUser,
  updateName as cognitoUpdateName,
  updatePicture as cognitoUpdatePicture,
  changePassword as cognitoChangePassword,
  deleteAccount as cognitoDeleteAccount,
  type AuthUser,
} from '@/lib/auth';

export type AuthState = 'loading' | 'authenticated' | 'guest';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');

  // Check for existing session on mount
  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        setUser(u);
        setAuthState(u ? 'authenticated' : 'guest');
      })
      .catch(() => {
        setUser(null);
        setAuthState('guest');
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await cognitoSignIn(email, password);
    setUser(u);
    setAuthState('authenticated');
    return u;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    await cognitoSignUp(email, password, name);
  }, []);

  const confirm = useCallback(async (email: string, code: string) => {
    await cognitoConfirm(email, code);
  }, []);

  const logout = useCallback(() => {
    cognitoSignOut();
    setUser(null);
    setAuthState('guest');
  }, []);

  const updateName = useCallback(async (name: string) => {
    await cognitoUpdateName(name);
    setUser((prev) => prev ? { ...prev, name } : prev);
  }, []);

  const updatePicture = useCallback(async (url: string) => {
    await cognitoUpdatePicture(url);
    setUser((prev) => prev ? { ...prev, picture: url || undefined } : prev);
  }, []);

  const changePasswordFn = useCallback(async (oldPw: string, newPw: string) => {
    await cognitoChangePassword(oldPw, newPw);
  }, []);

  const deleteAccountFn = useCallback(async (password: string) => {
    await cognitoDeleteAccount(password);
    setUser(null);
    setAuthState('guest');
  }, []);

  return {
    user,
    authState,
    isAuthenticated: authState === 'authenticated',
    isGuest: authState === 'guest',
    isLoading: authState === 'loading',
    login,
    register,
    confirm,
    logout,
    updateName,
    updatePicture,
    changePassword: changePasswordFn,
    deleteAccount: deleteAccountFn,
  } as const;
}

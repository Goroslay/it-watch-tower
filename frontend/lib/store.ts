'use client';
import { create } from 'zustand';

interface AuthState {
  token: string | null;
  initialized: boolean;
  setToken: (token: string) => void;
  clearToken: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  initialized: false,
  setToken: (token) => {
    localStorage.setItem('itw_token', token);
    set({ token });
  },
  clearToken: () => {
    localStorage.removeItem('itw_token');
    set({ token: null });
  },
  init: () => {
    const token = localStorage.getItem('itw_token');
    set({ token, initialized: true });
  },
}));

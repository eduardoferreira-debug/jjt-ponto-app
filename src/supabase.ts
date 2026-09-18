import { createClient } from '@supabase/supabase-js';

// Coloca aqui o teu URL e a tua Chave ANON reais do Supabase entre aspas:
const supabaseUrl = 'https://vyywdhkhraondnhagnes.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5eXdkaGtocmFvbmRuaGFnbmVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2OTU1NzEsImV4cCI6MjEwMDI3MTU3MX0.Vd0Rb9Ob6XxAn4kMk4qXNKQxL1y6qcBwNpgpQy-c6b4';

const getStorageSeguro = () => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.getItem('test');
      return window.sessionStorage;
    }
  } catch (e) {
    console.warn('sessionStorage inacessível, a usar fallback.', e);
  }
  return undefined;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getStorageSeguro(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

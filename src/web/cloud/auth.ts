/**
 * Estado de la sesión. La calculadora NO requiere cuenta: la sesión solo sirve para guardar
 * en la nube. Recuperación de sesión: supabase-js la guarda y la renueva sola.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthStatus = 'desactivado' | 'cargando' | 'anonimo' | 'conectado';

export interface AuthSnapshot {
  status: AuthStatus;
  user: { id: string; email: string } | null;
  /** Google habilitado en el proyecto (lo informa el propio Supabase). */
  googleEnabled: boolean;
}

export class AuthStore {
  private snapshot: AuthSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly supabase: SupabaseClient | null,
    private readonly settingsUrl: string | null,
    private readonly publishableKey: string | null,
  ) {
    this.snapshot = { status: supabase ? 'cargando' : 'desactivado', user: null, googleEnabled: false };
    if (!supabase) return;
    supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      this.set({ status: u ? 'conectado' : 'anonimo', user: u ? { id: u.id, email: u.email ?? '' } : null });
    });
    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      this.set({ status: u ? 'conectado' : 'anonimo', user: u ? { id: u.id, email: u.email ?? '' } : null });
    });
    void this.loadProviders();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): AuthSnapshot => this.snapshot;

  private set(patch: Partial<AuthSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (next.status === this.snapshot.status && next.user?.id === this.snapshot.user?.id && next.googleEnabled === this.snapshot.googleEnabled) return;
    this.snapshot = next;
    for (const fn of this.listeners) fn();
  }

  private async loadProviders(): Promise<void> {
    if (!this.settingsUrl || !this.publishableKey) return;
    try {
      const res = await fetch(this.settingsUrl, { headers: { apikey: this.publishableKey } });
      const settings = (await res.json()) as { external?: { google?: boolean } };
      this.set({ googleEnabled: settings.external?.google === true });
    } catch {
      this.set({ googleEnabled: false });
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (!this.supabase) throw new Error('Las cuentas no están disponibles en esta versión.');
    if (!this.snapshot.googleEnabled) throw new Error('El inicio de sesión con Google todavía no está configurado en este entorno.');
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, scopes: 'openid email profile' },
    });
    if (error) throw new Error('No se pudo iniciar sesión con Google.');
  }

  /** Solo staging (usuarios de prueba). En producción esta opción no se muestra. */
  async signInWithPassword(email: string, password: string): Promise<void> {
    if (!this.supabase) throw new Error('Las cuentas no están disponibles en esta versión.');
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Correo o contraseña incorrectos.');
  }

  async signOut(): Promise<void> {
    if (!this.supabase) return;
    await this.supabase.auth.signOut();
    this.set({ status: 'anonimo', user: null });
  }
}

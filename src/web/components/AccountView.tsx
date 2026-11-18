import { useState, useSyncExternalStore } from 'react';
import type { AuthStore } from '../cloud/auth';

interface Props {
  auth: AuthStore;
  testPasswordLogin: boolean;
}

/**
 * «Mi cuenta». La calculadora funciona sin cuenta; la cuenta sirve para guardar vehículos,
 * cotizaciones y datos comerciales en la nube y recuperarlos en otro dispositivo.
 */
export function AccountView({ auth, testPasswordLogin }: Props) {
  const s = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const run = async (action: () => Promise<void>) => {
    setFailure(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  if (s.status === 'desactivado') {
    return (
      <div className="layout single">
        <div className="card">
          <h2 className="sec">Mi cuenta</h2>
          <p className="sub">Las cuentas no están disponibles en esta versión. Todo se guarda solo en este navegador.</p>
        </div>
      </div>
    );
  }

  if (s.status === 'conectado' && s.user) {
    return (
      <div className="layout single">
        <div className="card">
          <h2 className="sec">Mi cuenta</h2>
          <p>
            Sesión iniciada como <strong>{s.user.email}</strong>.
          </p>
          <p className="sub">Tus vehículos, cotizaciones y datos comerciales se guardan en tu cuenta. Puedes abrirlos desde otro dispositivo.</p>
          <div className="row-gap">
            <button type="button" className="btn2" disabled={busy} onClick={() => void run(() => auth.signOut())}>
              Cerrar sesión
            </button>
          </div>
          <p className="sub">Al cerrar sesión vuelves al modo sin cuenta: verás solo lo guardado en este navegador.</p>
          {failure ? <p className="warn">{failure}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="layout single">
      <div className="card">
        <h2 className="sec">Mi cuenta</h2>
        <p className="sub">
          No necesitas cuenta para calcular ni cotizar. Inicia sesión para guardar tus vehículos y cotizaciones en la nube y recuperarlos en otro dispositivo.
        </p>
        <button type="button" className="btn" disabled={busy || s.status === 'cargando'} onClick={() => void run(() => auth.signInWithGoogle())}>
          Continuar con Google
        </button>
        {!s.googleEnabled && s.status !== 'cargando' ? (
          <p className="sub">El inicio con Google todavía no está configurado en este entorno de pruebas.</p>
        ) : null}
        {testPasswordLogin ? (
          <form
            className="test-login"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => auth.signInWithPassword(email, password));
            }}
          >
            <p className="tag tag-warn">Acceso de prueba (solo staging)</p>
            <label className="field">
              <span className="field-label">Correo</span>
              <span className="field-input">
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </span>
            </label>
            <label className="field">
              <span className="field-label">Contraseña</span>
              <span className="field-input">
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </span>
            </label>
            <button type="submit" className="btn2" disabled={busy}>
              Entrar con usuario de prueba
            </button>
          </form>
        ) : null}
        {failure ? (
          <p className="warn" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </div>
  );
}

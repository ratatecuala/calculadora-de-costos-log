/**
 * Almacenamiento LOCAL de la herramienta (D-2): IndexedDB en el navegador, detrás de una interfaz con un
 * adaptador en memoria para las pruebas (no se agregan dependencias). Base propia `medicion.v1`, separada
 * del almacenamiento de la app comercial. Nada sale del dispositivo: sin red, sin Supabase.
 */

export const NOMBRE_BD = 'medicion.v1';
export const COLECCIONES = ['vehiculos', 'presupuestos', 'viajes', 'cargas', 'fotos', 'ajustes'] as const;
export type Coleccion = (typeof COLECCIONES)[number];

export interface Almacen {
  listar<T>(coleccion: Coleccion): Promise<T[]>;
  obtener<T>(coleccion: Coleccion, id: string): Promise<T | null>;
  /** Inserta o reemplaza por `id`. Las reglas de inmutabilidad están en `repositorio.ts`. */
  guardar<T extends { id: string }>(coleccion: Coleccion, registro: T): Promise<void>;
  borrar(coleccion: Coleccion, id: string): Promise<void>;
  borrarTodo(): Promise<void>;
}

/** Adaptador en memoria (pruebas). Copia profunda al entrar y salir, como IndexedDB. */
export class AlmacenMemoria implements Almacen {
  private datos = new Map<Coleccion, Map<string, unknown>>(COLECCIONES.map((c) => [c, new Map()]));

  private col(c: Coleccion): Map<string, unknown> {
    const m = this.datos.get(c);
    if (!m) throw new Error(`Colección desconocida: ${c}`);
    return m;
  }
  async listar<T>(c: Coleccion): Promise<T[]> {
    return [...this.col(c).values()].map((x) => copia(x) as T);
  }
  async obtener<T>(c: Coleccion, id: string): Promise<T | null> {
    const x = this.col(c).get(id);
    return x === undefined ? null : (copia(x) as T);
  }
  async guardar<T extends { id: string }>(c: Coleccion, r: T): Promise<void> {
    this.col(c).set(r.id, copia(r));
  }
  async borrar(c: Coleccion, id: string): Promise<void> {
    this.col(c).delete(id);
  }
  async borrarTodo(): Promise<void> {
    for (const m of this.datos.values()) m.clear();
  }
}

/** `structuredClone` conserva los Blob (fotos) igual que IndexedDB. */
function copia<T>(x: T): T {
  return structuredClone(x);
}

/** Adaptador IndexedDB (navegador). */
export class AlmacenIndexedDB implements Almacen {
  private constructor(private readonly bd: IDBDatabase) {}

  static abrir(nombre: string = NOMBRE_BD): Promise<AlmacenIndexedDB> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Este navegador no permite guardar datos locales (IndexedDB).'));
        return;
      }
      const req = indexedDB.open(nombre, 1);
      req.onupgradeneeded = () => {
        const bd = req.result;
        for (const c of COLECCIONES) if (!bd.objectStoreNames.contains(c)) bd.createObjectStore(c, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(new AlmacenIndexedDB(req.result));
      req.onerror = () => reject(req.error ?? new Error('No se pudo abrir el almacenamiento local.'));
      req.onblocked = () => reject(new Error('El almacenamiento local está bloqueado por otra pestaña.'));
    });
  }

  private tx<R>(c: Coleccion, modo: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<R> | null): Promise<R | undefined> {
    return new Promise((resolve, reject) => {
      const t = this.bd.transaction(c, modo);
      const req = op(t.objectStore(c));
      let res: R | undefined;
      if (req) req.onsuccess = () => (res = req.result);
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error ?? new Error('Error de almacenamiento local.'));
      t.onabort = () => reject(t.error ?? new Error('Operación de almacenamiento cancelada (¿sin espacio?).'));
    });
  }

  async listar<T>(c: Coleccion): Promise<T[]> {
    return ((await this.tx(c, 'readonly', (s) => s.getAll())) ?? []) as T[];
  }
  async obtener<T>(c: Coleccion, id: string): Promise<T | null> {
    return ((await this.tx(c, 'readonly', (s) => s.get(id))) ?? null) as T | null;
  }
  async guardar<T extends { id: string }>(c: Coleccion, r: T): Promise<void> {
    await this.tx(c, 'readwrite', (s) => s.put(r));
  }
  async borrar(c: Coleccion, id: string): Promise<void> {
    await this.tx(c, 'readwrite', (s) => s.delete(id));
  }
  async borrarTodo(): Promise<void> {
    for (const c of COLECCIONES) await this.tx(c, 'readwrite', (s) => s.clear());
  }
}

/** Pide almacenamiento persistente (el navegador puede negarlo). `null` si no existe la API. */
export async function pedirPersistencia(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/**
 * Importar una copia de seguridad: TODO O NADA (D-2). Se usa en el historial y, antes del alta, en
 * «Restaurar una copia de seguridad». La validación y la escritura atómica están en `repositorio.ts`.
 */
import { useState } from 'react';
import { fusionarRespaldo, leerRespaldo, type Respaldo } from '../repositorio';
import { useCtx } from '../ui';

export function ImportarCopia({ principal = false }: { principal?: boolean }) {
  const { a, recargar } = useCtx();
  const [resultado, setResultado] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<{ respaldo: Respaldo; conflictos: string[] } | null>(null);

  const importar = async (r: Respaldo, reemplazarMasRecientes: boolean) => {
    try {
      const res = await fusionarRespaldo(a, r, { reemplazarMasRecientes });
      if (!res.escrito) {
        setPendiente({ respaldo: r, conflictos: res.conflictos });
        setResultado(`No se importó nada: ${res.conflictos.length} conflicto(s). Revisa la lista y decide.`);
        return;
      }
      setPendiente(null);
      await recargar();
      setResultado(`Importado: ${res.agregados} nuevos, ${res.actualizados} actualizados, ${res.iguales} sin cambios.`);
    } catch (err) {
      setPendiente(null);
      setResultado(err instanceof Error ? err.message : 'No se pudo importar; no se escribió nada.');
    }
  };

  return (
    <>
      <label className={principal ? 'm-btn m-btn-primario m-foto' : 'm-btn m-btn-sec m-foto'}>
        {principal ? 'Elegir el archivo de la copia' : 'Importar copia (se suma sin duplicar)'}
        <input
          type="file"
          accept="application/json,.json"
          data-respaldo-importar
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importar(leerRespaldo(await f.text()), false);
            } catch (err) {
              setPendiente(null);
              setResultado(err instanceof Error ? err.message : 'No se pudo importar; no se escribió nada.');
            }
          }}
        />
      </label>
      {resultado ? (
        <p className="m-info" role="status" data-resultado-importar>
          {resultado}
        </p>
      ) : null}
      {pendiente ? (
        <div className="m-confirmar" data-conflictos>
          <ul className="m-avisos">
            {pendiente.conflictos.map((c) => (
              <li key={c} className="m-aviso">
                {c}
              </li>
            ))}
          </ul>
          <p className="m-nota">Los presupuestos sellados nunca se reemplazan. Para lo demás puedes quedarte con lo de este teléfono (no importar) o tomar lo editado más recientemente.</p>
          <div className="m-fila m-envolver">
            <button type="button" className="m-btn m-btn-sec" data-importar-recientes onClick={() => void importar(pendiente.respaldo, true)}>
              Importar tomando lo más reciente
            </button>
            <button
              type="button"
              className="m-btn"
              onClick={() => {
                setPendiente(null);
                setResultado('Importación cancelada: no se escribió nada.');
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

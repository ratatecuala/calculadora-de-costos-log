-- VERIFICACIONES DE SOLO LECTURA para #52 · VERSIÓN PSQL. Ejecutar SOLO con psql:
--   psql -X -f scripts/diseno/verificaciones-52/solo-lectura.sql
-- NO pegar en el editor SQL de Supabase: usa metaórdenes de psql (\set, \pset, \ir) que el editor no
-- entiende. Para el editor existe solo-lectura-editor.sql (SQL puro), que este archivo incluye tal cual:
-- ambas versiones ejecutan exactamente la misma consulta.
-- PREPARADAS, NO EJECUTADAS EN SUPABASE (A-74). Solo con autorización y DESPUÉS del respaldo real.
-- Todo corre dentro de `begin transaction read only; … rollback;`: cualquier escritura falla. Devuelve
-- conteos y configuración, nunca ids ni correos. Ningún hallazgo se repara automáticamente (D-52-4b).
\set ON_ERROR_STOP 1
\pset footer off
begin transaction read only;
\ir solo-lectura-editor.sql
rollback;

/**
 * Conversión entre los registros de la app y las filas de Supabase (funciones puras).
 * La fila de `client_quotes` se arma SOLO desde `toClientQuote()` (lista blanca).
 */
import { toClientQuote, type ClientQuote, type JobRecord } from '../../shared/clientQuote';
import type { VehicleInput, VehicleProfile } from '../../shared/vehicle';

export interface VehicleRow {
  id: string;
  owner_id: string;
  local_id: string | null;
  name: string;
  type: VehicleProfile['type'];
  fuel: VehicleProfile['fuel'];
  km_per_l: number | string | null;
  wear_per_km: number | string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function vehicleFromRow(r: VehicleRow): VehicleProfile {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    fuel: r.fuel,
    kmPerL: num(r.km_per_l),
    wearPerKm: num(r.wear_per_km),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function vehicleToRow(v: VehicleInput) {
  return { name: v.name, type: v.type, fuel: v.fuel, km_per_l: v.kmPerL, wear_per_km: v.wearPerKm };
}

export interface JobRow {
  id: string;
  local_id: string | null;
  number: number;
  quote_date: string;
  client_name: string;
  service_description: string;
  includes: string;
  conditions: string;
  valid_until: string;
  service_date: string;
  origin_label: string;
  destination_label: string;
  net_price: number | string;
  tax: JobRecord['tax'];
  status: JobRecord['status'];
  payment: JobRecord['payment'];
  issuer: JobRecord['issuer'] | null;
  waypoints: JobRecord['waypoints'];
  internal: JobRecord['internal'];
}

export function jobFromRow(r: JobRow): JobRecord {
  return {
    id: r.id,
    number: r.number,
    createdAt: r.quote_date,
    clientName: r.client_name,
    serviceDescription: r.service_description,
    includes: r.includes,
    conditions: r.conditions,
    validUntil: r.valid_until,
    serviceDate: r.service_date,
    originLabel: r.origin_label,
    destinationLabel: r.destination_label,
    netPrice: Number(r.net_price),
    tax: r.tax ?? null,
    status: r.status,
    payment: r.payment,
    ...(r.issuer ? { issuer: r.issuer } : {}),
    waypoints: r.waypoints ?? [],
    internal: r.internal,
  };
}

/** Fila de `jobs`. `localId` solo al migrar desde el navegador (evita duplicados). */
export function jobToRow(job: JobRecord, localId: string | null) {
  return {
    id: localId ? null : job.id,
    local_id: localId,
    number: job.number,
    quote_date: job.createdAt,
    client_name: job.clientName,
    service_description: job.serviceDescription,
    includes: job.includes,
    conditions: job.conditions,
    valid_until: job.validUntil,
    service_date: job.serviceDate,
    origin_label: job.originLabel,
    destination_label: job.destinationLabel,
    net_price: job.netPrice,
    tax: job.tax,
    status: job.status,
    payment: job.payment,
    issuer: job.issuer ?? null,
    waypoints: job.waypoints,
    internal: job.internal,
  };
}

/** Fila de `client_quotes`: exclusivamente los campos de la cotización al cliente. */
export function clientQuoteToRow(q: ClientQuote) {
  return {
    number: q.number,
    issued_at: q.issuedAt,
    business_name: q.businessName,
    business_phone: q.businessPhone,
    business_email: q.businessEmail,
    client_name: q.clientName,
    service_description: q.serviceDescription,
    includes: q.includes,
    conditions: q.conditions,
    valid_until: q.validUntil,
    service_date: q.serviceDate,
    origin_label: q.originLabel,
    destination_label: q.destinationLabel,
    net_price: q.netPrice,
    tax_amount: q.taxAmount,
    total: q.total,
  };
}

export type ClientQuoteRow = ReturnType<typeof clientQuoteToRow>;

export function clientQuoteFromRow(r: ClientQuoteRow): ClientQuote {
  return {
    number: r.number,
    issuedAt: r.issued_at,
    businessName: r.business_name,
    businessPhone: r.business_phone,
    businessEmail: r.business_email,
    clientName: r.client_name,
    serviceDescription: r.service_description,
    includes: r.includes,
    conditions: r.conditions,
    validUntil: r.valid_until,
    serviceDate: r.service_date,
    originLabel: r.origin_label,
    destinationLabel: r.destination_label,
    netPrice: Number(r.net_price),
    taxAmount: r.tax_amount === null ? null : Number(r.tax_amount),
    total: Number(r.total),
  };
}

/** Par (trabajo, cotización) listo para `create_job_with_quote`. */
export function jobWithQuotePayload(job: JobRecord, localId: string | null) {
  return { p_job: jobToRow(job, localId), p_quote: clientQuoteToRow(toClientQuote(job)) };
}

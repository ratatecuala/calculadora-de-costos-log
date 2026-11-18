/**
 * Separación entre costos internos y cotización al cliente (A-29).
 * `toClientQuote` copia SOLO los campos de la lista blanca: nada de combustible,
 * desgaste, gastos fijos, remuneración objetivo, margen ni km/minutos del proveedor.
 */
export interface BusinessProfile {
  name: string;
  phone: string;
  email: string;
}

export type JobStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'realizada';

/** Registro interno del trabajo (solo para el transportista). */
export interface JobRecord {
  id: string;
  /** Número INTERNO, único por cuenta (en la nube lo asigna la base; A-47). */
  number: number;
  /**
   * Número EMITIDO: el que figura en el documento que recibió el cliente. Solo difiere del
   * interno en cotizaciones importadas cuyo número ya estaba ocupado en la cuenta. Nunca se
   * cambia después de emitir. Ausente = igual al interno.
   */
  issuedNumber?: number;
  createdAt: string;
  clientName: string;
  serviceDescription: string;
  includes: string;
  conditions: string;
  validUntil: string;
  serviceDate: string;
  originLabel: string;
  destinationLabel: string;
  netPrice: number;
  tax: { ruleId: string; amount: number } | null;
  status: JobStatus;
  /** El pago se registra aparte: «aceptada» no es «pagada». */
  payment: 'pendiente' | 'recibido';
  /**
   * Copia de los datos del emisor al momento de emitir. Opcional solo por compatibilidad
   * con registros anteriores a esta versión.
   */
  issuer?: BusinessProfile;
  /** Direcciones escritas por el usuario (dato propio), para el enlace «Ver ruta en Google Maps». */
  waypoints: Array<{ role: 'base' | 'A' | 'B'; address: string }>;
  /** Datos internos: nunca llegan al cliente. */
  internal: {
    routeSource: 'simulado' | 'google' | 'declarado' | 'mixto';
    /** Km y minutos solo si su retención lo permite (A-38); si no, null. */
    km: number | null;
    minutes: number | null;
    costEstimate: number;
    costType: 'estimado' | 'cotaInferior' | 'cotaSuperior';
    suggestedPrice: number;
    margin: number;
    missing: string[];
    engineVersion: string;
    /** Vehículo usado y valores aplicados en esta cotización (dato propio, interno). */
    vehicle?: {
      id: string;
      name: string;
      type: 'camioneta' | 'furgon' | 'camionLiviano';
      fuel: 'gasolina' | 'diesel' | 'otro';
      kmPerL: number | null;
      wearPerKm: number | null;
      /** Campos ajustados solo para esta cotización. */
      adjusted: string[];
    } | null;
  };
}

export interface ClientQuote {
  number: number;
  issuedAt: string;
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  clientName: string;
  serviceDescription: string;
  includes: string;
  conditions: string;
  validUntil: string;
  serviceDate: string;
  originLabel: string;
  destinationLabel: string;
  netPrice: number;
  taxAmount: number | null;
  total: number;
}

/** Lista blanca: si se agrega un campo, la prueba de separación falla hasta revisarlo. */
export const CLIENT_QUOTE_KEYS = [
  'number',
  'issuedAt',
  'businessName',
  'businessPhone',
  'businessEmail',
  'clientName',
  'serviceDescription',
  'includes',
  'conditions',
  'validUntil',
  'serviceDate',
  'originLabel',
  'destinationLabel',
  'netPrice',
  'taxAmount',
  'total',
] as const satisfies ReadonlyArray<keyof ClientQuote>;

/**
 * Usa la copia del emisor guardada en el registro; `fallbackIssuer` solo se usa para
 * registros antiguos que no la tienen.
 */
export function toClientQuote(job: JobRecord, fallbackIssuer?: BusinessProfile): ClientQuote {
  const taxAmount = job.tax ? job.tax.amount : null;
  const issuer = job.issuer ?? fallbackIssuer ?? { name: '', phone: '', email: '' };
  return {
    // El documento muestra SIEMPRE el número emitido (A-47).
    number: job.issuedNumber ?? job.number,
    issuedAt: job.createdAt,
    businessName: issuer.name,
    businessPhone: issuer.phone,
    businessEmail: issuer.email,
    clientName: job.clientName,
    serviceDescription: job.serviceDescription,
    includes: job.includes,
    conditions: job.conditions,
    validUntil: job.validUntil,
    serviceDate: job.serviceDate,
    originLabel: job.originLabel,
    destinationLabel: job.destinationLabel,
    netPrice: job.netPrice,
    taxAmount,
    total: job.netPrice + (taxAmount ?? 0),
  };
}

const clp = (n: number) => `$${new Intl.NumberFormat('es-CL').format(n)}`;

/** Texto para WhatsApp, construido solo desde la cotización al cliente. */
export function whatsappText(q: ClientQuote): string {
  const lines = [
    `Cotización N° ${String(q.number).padStart(4, '0')} — ${q.businessName}`,
    `Cliente: ${q.clientName}`,
    `Servicio: ${q.serviceDescription}`,
    `Recorrido: ${q.originLabel} → ${q.destinationLabel}`,
    q.serviceDate ? `Fecha del servicio: ${q.serviceDate}` : '',
    q.includes ? `Incluye: ${q.includes}` : '',
    q.taxAmount === null
      ? `Valor neto: ${clp(q.netPrice)}`
      : `Neto ${clp(q.netPrice)} + IVA ${clp(q.taxAmount)} = Total ${clp(q.total)}`,
    q.validUntil ? `Válida hasta: ${q.validUntil}` : '',
    q.conditions ? `Condiciones: ${q.conditions}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function whatsappUrl(q: ClientQuote): string {
  return `https://wa.me/?text=${encodeURIComponent(whatsappText(q))}`;
}

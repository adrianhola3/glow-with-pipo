export const PRODUCT_CATEGORIES = [
  'Rostro',
  'Labios',
  'Rubor',
  'Cejas',
  'Sombras',
  'Pestañas',
  'Iluminador',
  'Accesorios'
];

export const SOCIAL_PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'whatsapp', label: 'WhatsApp Directo' },
  { id: 'other', label: 'Otro' }
];

export const PAYMENT_METHODS = [
  { id: 'yape', label: 'Yape' },
  { id: 'plin', label: 'Plin' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'transfer', label: 'Transferencia' }
];

export const SALE_STATUSES = {
  pending_delivery: { label: 'Pendiente de entrega', badgeClass: 'badge-warning' },
  delivered: { label: 'Entregado', badgeClass: 'badge-success' },
  cancelled: { label: 'Cancelado', badgeClass: 'badge-danger' }
};

export const DEFAULT_COMBO_RATIO = 0.75;
export const UNAC_RETENTION_RATE = 0.20;
export const UNAC_MIN_RETENTION = 5.00;
export const RESERVATION_HOLD_MINUTES = 15;

export const FULFILLMENT_STAGES = {
  pending_pack: { label: 'Por empacar', badgeClass: 'badge-warning' },
  packed: { label: 'Empacado', badgeClass: 'badge-brand' },
  dispatched: { label: 'En tránsito / Agencia', badgeClass: 'badge-brand' },
  delivered: { label: 'Entregado', badgeClass: 'badge-success' }
};

export const DEFAULT_SHIPPING_METHODS = [
  {
    id: 'unac_pickup',
    code: 'ENV-UNAC',
    name: 'Entrega en UNAC / Puntos Glow',
    carrier: 'unac',
    shippingPaymentMode: 'free',
    baseFee: 0,
    minAdvanceAmount: 0,
    requiresDni: false,
    requiresAddress: false,
    active: true,
    sortOrder: 1,
    description: 'Entrega coordinada sin costo de envío'
  },
  {
    id: 'shalom_agency',
    code: 'ENV-SHALOM',
    name: 'Shalom · Agencia a Agencia (Flete pago en destino)',
    carrier: 'shalom',
    shippingPaymentMode: 'collect_on_delivery',
    baseFee: 0,
    minAdvanceAmount: 30,
    requiresDni: true,
    requiresAddress: false,
    active: true,
    sortOrder: 2,
    description: 'Recoges en agencia Shalom con tu DNI y pagas el flete allá'
  },
  {
    id: 'olva_lima',
    code: 'ENV-OLVA-LIM',
    name: 'Olva Courier · Lima Metropolitana y Callao',
    carrier: 'olva',
    shippingPaymentMode: 'prepaid_to_pipo',
    baseFee: 10,
    minAdvanceAmount: 30,
    requiresDni: true,
    requiresAddress: true,
    active: true,
    sortOrder: 3,
    description: 'Envío a domicilio 24-48h hábiles'
  },
  {
    id: 'olva_provincia',
    code: 'ENV-OLVA-PROV',
    name: 'Olva Courier · Provincias a Domicilio',
    carrier: 'olva',
    shippingPaymentMode: 'prepaid_to_pipo',
    baseFee: 20,
    minAdvanceAmount: 30,
    requiresDni: true,
    requiresAddress: true,
    active: true,
    sortOrder: 4,
    description: 'Envío a domicilio 48-72h hábiles'
  }
];

export const SHADE_COLOR_PRESETS = [
  { hex: '#F48FB1', label: 'Rosa Pastel' },
  { hex: '#EC407A', label: 'Fucsia / Berry' },
  { hex: '#C084FC', label: 'Morado / Lila' },
  { hex: '#FACC15', label: 'Amarillo' },
  { hex: '#38BDF8', label: 'Celeste' },
  { hex: '#4ADE80', label: 'Verde Menta' },
  { hex: '#E6CCB2', label: 'Avena / Beige' },
  { hex: '#D4A373', label: 'Nude / Miel' },
  { hex: '#FB7185', label: 'Coral / Durazno' },
  { hex: '#E11D48', label: 'Rojo Cereza' },
  { hex: '#881337', label: 'Vino / Burgundy' },
  { hex: '#9A3412', label: 'Terracota / Canela' },
  { hex: '#78350F', label: 'Chocolate / Café' },
  { hex: '#FDE047', label: 'Dorado Champagne' },
  { hex: '#F8FAFC', label: 'Blanco / Perla' },
  { hex: '#1E293B', label: 'Negro' }
];


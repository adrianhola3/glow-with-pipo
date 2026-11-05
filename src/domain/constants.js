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

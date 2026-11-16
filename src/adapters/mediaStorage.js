export const STOREFRONT_MEDIA_BUCKET = 'storefront-media';

export function computeCompressedDimensions(width, height, maxDimension = 1200) {
  const safeW = Math.max(1, Math.trunc(Number(width) || 1));
  const safeH = Math.max(1, Math.trunc(Number(height) || 1));
  const limit = Math.max(64, Math.trunc(Number(maxDimension) || 1200));

  const largest = Math.max(safeW, safeH);
  if (largest <= limit) {
    return { width: safeW, height: safeH };
  }

  const scale = limit / largest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale))
  };
}

function dataUrlToBlobAndBytes(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
  const mimeType = match ? match[1] : 'image/webp';
  const base64Part = match ? match[2] : '';

  let bytes;
  if (typeof Buffer !== 'undefined') {
    bytes = Buffer.from(base64Part, 'base64');
  } else if (typeof atob === 'function') {
    const bin = atob(base64Part);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
  } else {
    bytes = new Uint8Array(0);
  }

  const blob =
    typeof Blob !== 'undefined'
      ? new Blob([bytes], { type: mimeType })
      : null;

  return { blob, bytes, dataUrl: String(dataUrl || ''), mimeType };
}

function readSourceAsDataUrl(fileOrSource) {
  if (typeof fileOrSource === 'string') {
    return Promise.resolve(fileOrSource);
  }
  if (typeof FileReader !== 'undefined' && fileOrSource instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
      reader.readAsDataURL(fileOrSource);
    });
  }
  if (fileOrSource && typeof fileOrSource.arrayBuffer === 'function') {
    return fileOrSource.arrayBuffer().then((buf) => {
      const mime = fileOrSource.type || 'image/webp';
      const b64 =
        typeof Buffer !== 'undefined'
          ? Buffer.from(buf).toString('base64')
          : '';
      return `data:${mime};base64,${b64}`;
    });
  }
  return Promise.resolve('');
}

export async function compressImageToWebP(
  fileOrSource,
  { maxDimension = 1200, quality = 0.82 } = {}
) {
  const sourceDataUrl = await readSourceAsDataUrl(fileOrSource);
  if (!sourceDataUrl) {
    throw new Error('Imagen vacía o formato no soportado.');
  }

  const canUseBrowserCanvas =
    typeof document !== 'undefined' &&
    typeof Image !== 'undefined' &&
    typeof document.createElement === 'function';

  if (canUseBrowserCanvas) {
    try {
      const compressedDataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const { width, height } = computeCompressedDimensions(
              img.naturalWidth || img.width || maxDimension,
              img.naturalHeight || img.height || maxDimension,
              maxDimension
            );
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(sourceDataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const webpUrl = canvas.toDataURL('image/webp', quality);
            resolve(webpUrl && webpUrl.startsWith('data:image/') ? webpUrl : sourceDataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('No se pudo decodificar la imagen en el navegador.'));
        img.src = sourceDataUrl;
      });
      return dataUrlToBlobAndBytes(compressedDataUrl);
    } catch {
      return dataUrlToBlobAndBytes(sourceDataUrl);
    }
  }

  return dataUrlToBlobAndBytes(sourceDataUrl);
}

function generateMediaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadStorefrontMedia(fileOrSource, optionsOrFolder = {}) {
  const opts =
    typeof optionsOrFolder === 'string'
      ? { folder: optionsOrFolder }
      : optionsOrFolder || {};
  const cleanFolder = String(opts.folder || 'products')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase() || 'products';

  const compressed = await compressImageToWebP(fileOrSource, {
    maxDimension: opts.maxDimension ?? 1200,
    quality: opts.quality ?? 0.82
  });

  const client = opts.client || null;
  if (client?.storage && typeof client.storage.from === 'function') {
    try {
      const ext = compressed.mimeType === 'image/png' ? 'png' : compressed.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
      const objectPath = `${cleanFolder}/${Date.now()}-${generateMediaId()}.${ext}`;
      const bucket = client.storage.from(STOREFRONT_MEDIA_BUCKET);
      const uploadBody = compressed.blob || compressed.bytes;
      const { error: uploadErr } = await bucket.upload(objectPath, uploadBody, {
        contentType: compressed.mimeType || 'image/webp',
        cacheControl: '31536000',
        upsert: true
      });
      if (!uploadErr) {
        const pubRes = bucket.getPublicUrl(objectPath);
        const publicUrl = pubRes?.data?.publicUrl || pubRes?.publicURL || '';
        if (publicUrl) {
          return {
            url: publicUrl,
            path: objectPath,
            storage: 'supabase',
            mimeType: compressed.mimeType || 'image/webp'
          };
        }
      }
    } catch {
      // Fallback to compressed inline DataURL if Storage bucket is unavailable
    }
  }

  return {
    url: compressed.dataUrl,
    path: null,
    storage: 'inline-fallback',
    mimeType: compressed.mimeType || 'image/webp'
  };
}

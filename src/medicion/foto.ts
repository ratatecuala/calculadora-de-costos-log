/**
 * Foto del TRIP u odómetro (D-3). Solo sirve para que el usuario lea el número y lo escriba: sin OCR.
 * Si el usuario elige conservarla, se re-codifica en un canvas (lo que descarta EXIF, GPS y modelo del
 * equipo) y se reduce. Nunca va al CSV, al paquete ni a la nube.
 */

/** Lado mayor de la foto conservada: suficiente para leer un número del tablero. */
export const LADO_MAXIMO_FOTO = 1024;

export async function recodificarFoto(foto: Blob, ladoMaximo = LADO_MAXIMO_FOTO): Promise<Blob> {
  const bmp = await createImageBitmap(foto);
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la foto.');
    ctx.drawImage(bmp, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo re-codificar la foto.'))), 'image/jpeg', 0.75),
    );
  } finally {
    bmp.close();
  }
}

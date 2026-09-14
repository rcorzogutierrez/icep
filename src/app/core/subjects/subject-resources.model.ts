import type { Timestamp } from 'firebase/firestore';

export type ResourceProvider = 'drive' | 'dropbox' | 'link';

/**
 * Documento en Firestore: subjectResources/{id}. Un link a un recurso
 * externo (apuntes, libro, carpeta compartida) que el profesor deja
 * disponible para quien tenga acceso a la materia — ver
 * `detectResourceProvider` para cómo se arman `provider`/`driveFileId` a
 * partir de la URL, al crear el recurso.
 */
export interface SubjectResource {
  id: string;
  subjectId: string;
  title: string;
  url: string;
  provider: ResourceProvider;
  /** Solo si `provider === 'drive'` y la URL trae un id de archivo reconocible — arma la miniatura pública sin backend (ver resource-card.ts). */
  driveFileId: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
}

/**
 * Detecta el proveedor de una URL 100% en el cliente, sin backend: Drive
 * expone una miniatura pública (`drive.google.com/thumbnail?id=...`) para
 * cualquier archivo compartido "cualquiera con el link", así que alcanza
 * con sacarle el id de la URL para mostrar la miniatura real. Dropbox y el
 * resto de los links no tienen un mecanismo equivalente sin autenticarse
 * (leer la página para sacar metadata real necesitaría un fetch del lado
 * del servidor, que no tenemos) — quedan con ícono genérico a propósito,
 * no es una limitación por descuido.
 */
export function detectResourceProvider(url: string): {
  provider: ResourceProvider;
  driveFileId: string | null;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { provider: 'link', driveFileId: null };
  }

  if (parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com') {
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return { provider: 'drive', driveFileId: fileIdMatch ? fileIdMatch[1] : null };
  }
  if (parsed.hostname === 'dropbox.com' || parsed.hostname.endsWith('.dropbox.com')) {
    return { provider: 'dropbox', driveFileId: null };
  }
  return { provider: 'link', driveFileId: null };
}

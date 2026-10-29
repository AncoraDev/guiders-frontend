/**
 * Visitor Display Name Utility
 *
 * Función centralizada para obtener el nombre de visualización de un visitante
 * siguiendo una estrategia de fallback consistente.
 */

export interface VisitorInfo {
  id?: string;
  name?: string;
  email?: string;
  /** Alias de contacto (prioridad máxima si existe) */
  alias?: string;
}

export interface ContactNameInfo {
  alias?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
}

function buildPersonName(nombre?: string, apellidos?: string): string {
  return [nombre, apellidos]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Formato con alias: "Alias (Nombre Apellidos)".
 * Sin nombre real → solo alias. Sin alias → no añade paréntesis.
 */
function formatAliasWithPersonName(alias: string, personName: string): string {
  return personName ? `${alias} (${personName})` : alias;
}

/**
 * Nombre a mostrar a partir de datos de contacto del lead.
 * Prioridad: alias (+ nombre/apellidos entre paréntesis) → nombre+apellidos → email → teléfono.
 */
export function getContactDisplayName(
  contact: ContactNameInfo | null | undefined
): string | null {
  if (!contact) return null;

  const personName = buildPersonName(contact.nombre, contact.apellidos);
  const alias = contact.alias?.trim();
  if (alias) return formatAliasWithPersonName(alias, personName);

  if (personName) return personName;

  if (contact.email?.trim()) return contact.email.trim();
  if (contact.telefono?.trim()) return contact.telefono.trim();

  return null;
}

/**
 * Obtiene el nombre de visualización para un visitante.
 *
 * Estrategia de fallback:
 * 1. Si existe alias → "Alias (name)" si hay name útil; si no, solo alias
 * 2. Si existe name y no está vacío ni es genérico → usar name
 * 3. Si existe email y no está vacío → usar email
 * 4. Si existe id → mostrar "Visitante #[últimos 8 caracteres del ID]"
 * 5. Si no hay nada → mostrar "Visitante anónimo"
 */
export function getVisitorDisplayName(visitor: VisitorInfo): string {
  // Nombres genéricos que deben ser ignorados (tratados como vacíos)
  const genericNames = [
    'Visitante',
    'Chat sin título',
    'visitante',
    'Visitor',
    'visitor',
  ];

  const alias = visitor.alias?.trim();
  const trimmedName = visitor.name?.trim() ?? '';
  const looksLikeIdLabel = /^Visitante\s+#?[0-9a-f]{8}$/i.test(trimmedName);
  const usefulName =
    trimmedName &&
    !genericNames.includes(trimmedName) &&
    !looksLikeIdLabel &&
    trimmedName !== alias
      ? trimmedName
      : '';

  // 1. Prioridad: alias (+ nombre entre paréntesis si aplica)
  if (alias) {
    // Evitar "Alias (Alias (Nombre))" si name ya viene formateado
    if (usefulName.startsWith(`${alias} (`)) {
      return usefulName;
    }
    return formatAliasWithPersonName(alias, usefulName);
  }

  // 2. Prioridad: nombre si existe, no está vacío y no es genérico
  if (usefulName) {
    return usefulName;
  }

  // 3. Fallback: email si existe y no está vacío
  if (visitor.email && visitor.email.trim()) {
    return visitor.email.trim();
  }

  // 4. Fallback: ID con formato "Visitante #XXXXXXXX"
  if (visitor.id && visitor.id.trim()) {
    const shortId = visitor.id.slice(-8);
    return `Visitante #${shortId}`;
  }

  // 5. Fallback final
  return 'Visitante anónimo';
}

/** Últimos 8 caracteres del id, con #. Null si no hay id. */
export function visitorShortId(id?: string | null): string | null {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  return `#${trimmed.slice(-8)}`;
}

/**
 * El id corto que debe verse junto al nombre.
 * Si el nombre ya es "Visitante #xxxxxxxx", no se repite.
 */
export function visitorShortIdBesideName(
  name: string,
  id?: string | null
): string | null {
  const shortId = visitorShortId(id);
  if (!shortId) return null;
  if (name.includes(shortId)) return null;
  return shortId;
}

/**
 * Obtiene el nombre de visualización a partir de un participante de chat.
 */
export function getParticipantDisplayName(
  participant: { id?: string; name?: string; email?: string } | undefined | null
): string {
  if (!participant) {
    return 'Visitante anónimo';
  }

  return getVisitorDisplayName({
    id: participant.id,
    name: participant.name,
    email: participant.email,
  });
}

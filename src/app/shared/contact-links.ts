/** Enlaces directos de contacto a partir del teléfono/email del lead. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 6 ? `tel:${digits}` : null;
}

export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function mailHref(email: string): string | null {
  return email.includes('@') ? `mailto:${email}` : null;
}

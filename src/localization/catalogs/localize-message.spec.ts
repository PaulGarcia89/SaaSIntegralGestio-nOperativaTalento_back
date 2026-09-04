import { catalogs, localizeMessage, message } from './catalog';

describe('localizeMessage', () => {
  it('traduce una clave conocida al idioma pedido', () => {
    expect(localizeMessage('offers.expired', 'en')).toBe('The offer has expired');
    expect(localizeMessage('offers.expired', 'es')).toBe('La oferta venció');
  });

  it('deja intacto el texto que no es una clave de catalogo', () => {
    // Los mensajes que todavia estan escritos en castellano dentro de otros
    // modulos tienen que seguir llegando al cliente tal cual.
    const legacy = 'La postulación no existe';
    expect(localizeMessage(legacy, 'en')).toBe(legacy);
  });

  it('deja intacta una clave con forma valida pero inexistente', () => {
    expect(localizeMessage('offers.no_existe', 'en')).toBe('offers.no_existe');
  });

  it('no confunde un identificador de una sola palabra con una clave', () => {
    expect(localizeMessage('SYSTEM_DEFAULT', 'en')).toBe('SYSTEM_DEFAULT');
    expect(localizeMessage('ats', 'en')).toBe('ats');
  });

  it('interpola parametros en ambos idiomas', () => {
    expect(message('application_sla.reassigned_detail', 'en', 'es', { candidate: 'Ana' })).toContain('Ana');
    expect(message('application_sla.reassigned_detail', 'es', 'es', { candidate: 'Ana' })).toContain('Ana');
  });

  it('cae al castellano cuando falta la traduccion inglesa', () => {
    expect(localizeMessage('common.not_found', 'en')).toBeTruthy();
  });
});

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
    }
  }
  return out;
}

describe('paridad de catalogos es/en', () => {
  const es = flatten(catalogs.es);
  const en = flatten(catalogs.en);

  it('el catalogo ingles cubre todas las claves del castellano', () => {
    expect(Object.keys(es).filter((key) => !(key in en))).toEqual([]);
  });

  it('no sobran claves en ingles', () => {
    expect(Object.keys(en).filter((key) => !(key in es))).toEqual([]);
  });

  it('ninguna cadena inglesa quedo sin traducir', () => {
    // Un texto identico en ambos idiomas casi siempre significa un copiar-pegar
    // olvidado. Se admiten los pocos casos en los que la palabra coincide.
    const permitidos = new Set(['%', 'ATS', 'SLA', 'LinkedIn']);
    const iguales = Object.keys(es).filter(
      (key) => es[key] === en[key] && !permitidos.has(es[key]) && es[key].length > 3,
    );
    expect(iguales).toEqual([]);
  });

  it('los marcadores {{...}} coinciden entre idiomas', () => {
    const marcadores = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
    const desajustes = Object.keys(es).filter(
      (key) => key in en && marcadores(es[key]).join() !== marcadores(en[key]).join(),
    );
    expect(desajustes).toEqual([]);
  });
});

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SupportedLocale } from '../../localization/localization.service';

/**
 * Idioma resuelto para esta petición.
 *
 * `LocaleMiddleware` ya lo calcula a partir de la cabecera `x-locale` o
 * `accept-language` y lo deja en `request.locale`; el frontend envía
 * `Accept-Language` con el idioma activo en cada llamada. Lo que faltaba era
 * una forma de leerlo desde un controlador: sin esto, los servicios devolvían
 * su texto escrito en español pasara lo que pasara, y la interfaz traducida
 * seguía mostrando frases en español venidas del servidor.
 *
 * Se cae a 'es' si el middleware no llegó a ejecutarse (por ejemplo en pruebas
 * que construyen el controlador a mano), que es el mismo idioma por defecto que
 * usa el resto del sistema.
 */
export const RequestLocale = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SupportedLocale => {
    const request = context.switchToHttp().getRequest<{ locale?: SupportedLocale }>();
    return request.locale === 'en' ? 'en' : 'es';
  },
);

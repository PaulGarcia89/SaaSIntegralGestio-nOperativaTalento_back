import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-code.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import { OperationalAlertService } from '../observability/operational-alert.service';
import { localizeMessage } from '../../localization/catalogs/catalog';
import { SupportedLocale } from '../../localization/localization.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly alerts: OperationalAlertService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithUser>();
    const response = context.getResponse<Response>();

    const payload = this.normalizeException(exception);
    // El idioma lo resuelve el LocaleMiddleware. El log y la huella de alertas
    // siguen usando `payload.message` sin traducir para que el fingerprint sea
    // estable entre idiomas; solo se traduce lo que ve el usuario.
    const locale: SupportedLocale =
      (request as { locale?: SupportedLocale }).locale === 'en' ? 'en' : 'es';
    const body = {
      error: {
        code: payload.code,
        message: localizeMessage(payload.message, locale),
        ...(payload.details !== undefined ? { details: payload.details } : {}),
        ...(payload.fieldErrors ? { fieldErrors: payload.fieldErrors } : {}),
        ...(payload.retryAfter !== undefined ? { retryAfter: payload.retryAfter } : {}),
        requestId: request.requestId ?? null,
      },
    };

    const trace = {
        type: 'exception',
        tenantId: request.tenant?.id ?? request.user?.tenantId ?? null,
        branchId: request.branch?.id ?? request.user?.activeBranchId ?? null,
        userId: request.user?.sub ?? null,
        method: request.method,
        route: request.originalUrl ?? request.url,
        statusCode: payload.status,
        code: payload.code,
        message: payload.message,
        requestId: request.requestId ?? null,
        fingerprint: `${payload.status}:${payload.code}:${request.method}:${request.route?.path ?? request.path}`,
        ...(exception instanceof Error && payload.status >= 500 ? { stack: exception.stack } : {}),
      };
    this.logger.error(JSON.stringify(trace));
    this.alerts.report({
      fingerprint: trace.fingerprint,
      requestId: trace.requestId,
      route: trace.route,
      method: trace.method,
      statusCode: trace.statusCode,
      tenantId: trace.tenantId,
      message: trace.message,
    });

    if (payload.retryAfter !== undefined) {
      response.setHeader('Retry-After', String(payload.retryAfter));
    }

    response.status(payload.status).json(body);
  }

  private normalizeException(exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (this.isStandardErrorResponse(response)) {
        return response;
      }

      if (exception instanceof BadRequestException) {
        return {
          message: this.extractMessage(response, 'Bad request'),
          code: ErrorCode.VALIDATION_ERROR,
          status,
        };
      }

      if (exception instanceof UnprocessableEntityException) {
        return {
          message: this.extractMessage(response, 'Validation failed'),
          code: ErrorCode.VALIDATION_ERROR,
          status,
        };
      }

      if (exception instanceof UnauthorizedException) {
        return {
          message: this.extractMessage(response, 'Unauthorized'),
          code: ErrorCode.AUTH_REQUIRED,
          status,
        };
      }

      if (exception instanceof ForbiddenException) {
        return {
          message: this.extractMessage(response, 'Forbidden'),
          code: ErrorCode.FORBIDDEN,
          status,
        };
      }

      if (exception instanceof NotFoundException) {
        return {
          message: this.extractMessage(response, 'Resource not found'),
          code: ErrorCode.RESOURCE_NOT_FOUND,
          status,
        };
      }

      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        return {
          message: this.extractMessage(response, 'Too many requests'),
          code: ErrorCode.RATE_LIMITED,
          status,
          retryAfter: this.extractRetryAfter(response),
        };
      }

      if (exception instanceof ServiceUnavailableException) {
        return {
          message: this.extractMessage(response, 'Service temporarily unavailable'),
          code: ErrorCode.SERVICE_UNAVAILABLE,
          status,
        };
      }

      return {
        message: this.extractMessage(response, 'Request failed'),
        code: status >= 500 ? ErrorCode.INTERNAL_SERVER_ERROR : ErrorCode.BAD_REQUEST,
        status,
      };
    }

    if (this.isPayloadTooLargeException(exception)) {
      return {
        message: 'Request payload is too large',
        code: ErrorCode.BAD_REQUEST,
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      };
    }

    return {
      message: 'Internal server error',
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private extractMessage(response: string | object, fallback: string) {
    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }

      if (typeof message === 'string') {
        return message;
      }
    }

    return fallback;
  }

  private isStandardErrorResponse(
    response: string | object,
  ): response is {
    message: string;
    code: ErrorCode;
    status: number;
    details?: unknown;
    fieldErrors?: Record<string, string[]>;
    retryAfter?: number;
  } {
    return (
      typeof response === 'object' &&
      response !== null &&
      'message' in response &&
      'code' in response &&
      'status' in response
    );
  }

  private extractRetryAfter(response: string | object) {
    if (typeof response !== 'object' || response === null || !('retryAfter' in response)) {
      return undefined;
    }

    const value = (response as { retryAfter?: unknown }).retryAfter;
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private isPayloadTooLargeException(exception: unknown) {
    if (exception instanceof PayloadTooLargeException) {
      return true;
    }

    if (typeof exception !== 'object' || exception === null) {
      return false;
    }

    const candidate = exception as { type?: string; status?: number; statusCode?: number };
    return (
      candidate.type === 'entity.too.large' ||
      candidate.status === HttpStatus.PAYLOAD_TOO_LARGE ||
      candidate.statusCode === HttpStatus.PAYLOAD_TOO_LARGE
    );
  }
}

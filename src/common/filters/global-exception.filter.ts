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
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../errors/error-code.enum';
import { RequestWithUser } from '../types/request-with-user.type';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithUser>();
    const response = context.getResponse<Response>();

    const payload = this.normalizeException(exception);
    const body = {
      error: payload.error,
      code: payload.code,
      status: payload.status,
    };

    this.logger.error(
      JSON.stringify({
        type: 'exception',
        tenantId: request.tenant?.id ?? request.user?.tenantId ?? null,
        branchId: request.branch?.id ?? request.user?.activeBranchId ?? null,
        userId: request.user?.sub ?? null,
        method: request.method,
        route: request.originalUrl ?? request.url,
        statusCode: payload.status,
        code: payload.code,
        error: payload.error,
      }),
    );

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
          error: this.extractMessage(response, 'Bad request'),
          code: ErrorCode.VALIDATION_ERROR,
          status,
        };
      }

      if (exception instanceof UnauthorizedException) {
        return {
          error: this.extractMessage(response, 'Unauthorized'),
          code: ErrorCode.UNAUTHORIZED,
          status,
        };
      }

      if (exception instanceof ForbiddenException) {
        return {
          error: this.extractMessage(response, 'Forbidden'),
          code: ErrorCode.FORBIDDEN,
          status,
        };
      }

      if (exception instanceof NotFoundException) {
        return {
          error: this.extractMessage(response, 'Resource not found'),
          code: ErrorCode.RESOURCE_NOT_FOUND,
          status,
        };
      }

      return {
        error: this.extractMessage(response, 'Request failed'),
        code: status >= 500 ? ErrorCode.INTERNAL_SERVER_ERROR : ErrorCode.BAD_REQUEST,
        status,
      };
    }

    if (this.isPayloadTooLargeException(exception)) {
      return {
        error: 'Request payload is too large',
        code: ErrorCode.BAD_REQUEST,
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      };
    }

    return {
      error: 'Internal server error',
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
  ): response is { error: string; code: ErrorCode; status: number } {
    return (
      typeof response === 'object' &&
      response !== null &&
      'error' in response &&
      'code' in response &&
      'status' in response
    );
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

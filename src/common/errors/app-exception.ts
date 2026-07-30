import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export class AppException extends HttpException {
  constructor(
    message: string,
    code: ErrorCode,
    status: HttpStatus,
    options?: {
      details?: unknown;
      fieldErrors?: Record<string, string[]>;
      retryAfter?: number;
    },
  ) {
    super(
      {
        message,
        code,
        status,
        ...(options?.details !== undefined ? { details: options.details } : {}),
        ...(options?.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
        ...(options?.retryAfter !== undefined ? { retryAfter: options.retryAfter } : {}),
      },
      status,
    );
  }
}

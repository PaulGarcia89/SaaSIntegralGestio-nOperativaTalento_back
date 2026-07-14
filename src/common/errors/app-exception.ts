import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';

export class AppException extends HttpException {
  constructor(
    error: string,
    code: ErrorCode,
    status: HttpStatus,
    details?: unknown,
  ) {
    super(
      {
        error,
        code,
        status,
        ...(details !== undefined ? { details } : {}),
      },
      status,
    );
  }
}

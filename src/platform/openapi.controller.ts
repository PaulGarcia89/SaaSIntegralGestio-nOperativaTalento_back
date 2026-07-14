import { Controller, Get } from '@nestjs/common';
import { OpenApiService } from './openapi.service';

@Controller()
export class OpenApiController {
  constructor(private readonly openApiService: OpenApiService) {}

  @Get('openapi.json')
  getDocument() {
    return this.openApiService.buildDocument();
  }
}

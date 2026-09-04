import { Controller, Get } from '@nestjs/common';
import { OpenApiService } from './openapi.service';
import { Public } from '../common/decorators/public.decorator';

@Controller()
@Public()
export class OpenApiController {
  constructor(private readonly openApiService: OpenApiService) {}

  @Get('openapi.json')
  getDocument() {
    return this.openApiService.buildDocument();
  }
}

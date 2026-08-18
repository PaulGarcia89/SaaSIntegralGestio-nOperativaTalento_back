import { IsObject } from 'class-validator';

export class PublicApplicationDraftDto {
  @IsObject()
  value!: Record<string, unknown>;
}

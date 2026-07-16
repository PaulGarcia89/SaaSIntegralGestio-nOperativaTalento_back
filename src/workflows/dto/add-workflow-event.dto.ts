import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddWorkflowEventDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

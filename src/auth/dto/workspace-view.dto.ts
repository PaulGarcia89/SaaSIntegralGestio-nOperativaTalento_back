import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWorkspaceViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  module!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(96)
  screen!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  workspaceKey?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateWorkspaceViewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { OnboardingTaskType, WorkflowOwnerType, WorkflowTaskStatus } from '@prisma/client';

export class OnboardingTemplateTaskDto {
  @IsString() taskKey!: string;
  @IsEnum(OnboardingTaskType) taskType!: OnboardingTaskType;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(WorkflowOwnerType) ownerType?: WorkflowOwnerType;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) dueOffsetDays?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) dependsOnKeys?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class CreateOnboardingTemplateDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OnboardingTemplateTaskDto)
  tasks!: OnboardingTemplateTaskDto[];
}

export class ApplyOnboardingTemplateDto {
  @IsUUID() templateId!: string;
  @IsOptional() @IsDateString() startDate?: string;
}

export class BulkApplyOnboardingTemplateDto extends ApplyOnboardingTemplateDto {
  @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) flowIds!: string[];
}

export class UpdateOnboardingTaskDto {
  @IsOptional() @IsEnum(WorkflowTaskStatus) status?: WorkflowTaskStatus;
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(WorkflowOwnerType) ownerType?: WorkflowOwnerType;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() blockingReason?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsEnum(OnboardingTaskType) taskType?: OnboardingTaskType;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) dependsOnKeys?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class ReviewEmployeeDocumentDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class UpdateOnboardingTemplateStatusDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class ReviseOnboardingTemplateDto extends CreateOnboardingTemplateDto {
  @IsOptional() @IsDateString() effectiveFrom?: string;
}

export class ApproveOnboardingTemplateDto {
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class CreateOnboardingLibraryItemDto {
  @IsIn(['TASK', 'DOCUMENT', 'POLICY']) type!: 'TASK' | 'DOCUMENT' | 'POLICY';
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(8) countryCode?: string;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
}

export class UpsertOnboardingRetentionPolicyDto {
  @IsString() @MaxLength(8) countryCode!: string;
  @IsString() @MaxLength(80) documentCategory!: string;
  @IsInt() @Min(1) @Max(36500) retentionDays!: number;
  @IsOptional() @IsString() @MaxLength(500) legalBasis?: string;
}

export class CreateOnboardingLegalHoldDto {
  @IsString() @MaxLength(1000) reason!: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
}

export class ApproveOnboardingRetentionPolicyDto {
  @IsOptional() @IsString() @MaxLength(500) reviewNote?: string;
}

export class ReorderOnboardingTaskItemDto { @IsUUID() id!: string; @IsInt() @Min(0) sortOrder!: number; }
export class ReorderOnboardingTasksDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ReorderOnboardingTaskItemDto)
  items!: ReorderOnboardingTaskItemDto[];
}

export class UpdateEmployeeDocumentLifecycleDto { @IsOptional() @IsDateString() expiresAt?: string; }

import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
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

export class UpdateOnboardingTaskDto {
  @IsOptional() @IsEnum(WorkflowTaskStatus) status?: WorkflowTaskStatus;
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(WorkflowOwnerType) ownerType?: WorkflowOwnerType;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsString() blockingReason?: string;
}

export class ReviewEmployeeDocumentDto {
  @IsIn(['APPROVED', 'REJECTED']) status!: 'APPROVED' | 'REJECTED';
}

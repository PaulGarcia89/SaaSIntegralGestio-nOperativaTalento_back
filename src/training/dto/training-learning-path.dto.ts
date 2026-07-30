import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateTrainingLearningPathDto {
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(1200) description?: string;
  @IsOptional() @IsString() @MaxLength(600) objective?: string;
  @IsOptional() @IsString() @MaxLength(600) targetAudience?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class AddTrainingPathCourseDto {
  @IsUUID() courseId!: string;
  @IsOptional() @IsUUID() prerequisiteCourseId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(500) sortOrder?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(3650) unlockAfterDays?: number;
}

export class CreateTrainingOnboardingRuleDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsUUID() onboardingTemplateId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsUUID() curriculumId?: string;
  @IsOptional() @IsString() @MaxLength(160) jobTitlePattern?: string;
  @IsOptional() @IsString() @MaxLength(80) roleCode?: string;
  @IsInt() @Min(1) @Max(3650) dueDays!: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

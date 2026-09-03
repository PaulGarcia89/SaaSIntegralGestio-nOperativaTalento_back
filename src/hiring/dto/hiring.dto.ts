import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateHiringContractDto {
  @IsOptional() @IsString()
  hiringManagerUserId?: string;

  @IsOptional() @IsString()
  hrResponsibleUserId?: string;

  @IsOptional() @IsString()
  roleTitle?: string;
}

export class UpdateHiringContractDto {
  @IsOptional() @IsString()
  roleTitle?: string;

  @IsOptional() @IsString()
  hiringManagerUserId?: string;

  @IsOptional() @IsString()
  hrResponsibleUserId?: string;

  @IsOptional() @IsString()
  nextAction?: string;

  @IsOptional() @IsString()
  nextActor?: string;

  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional() @IsString()
  deadlineAt?: string | null;
}

export class ConfigureHiringOfferDto {
  @IsString()
  jobOfferId!: string;

  @IsOptional() @IsString()
  jobOfferVersionId?: string;

  @IsOptional() @IsString()
  roleTitle?: string;
}

export class RequestHiringDocumentsDto {
  @IsIn(['IDENTIFICATION', 'TAX', 'ELIGIBILITY', 'AGREEMENT', 'POLICY', 'LICENSE', 'OTHER'])
  type!: string;

  @IsString()
  title!: string;

  @IsOptional() @IsBoolean()
  required?: boolean;

  @IsOptional() @IsIn(['CANDIDATE', 'DOCUSEAL', 'INTERNAL', 'IMPORT'])
  source?: string;
}

export class ReviewHiringDocumentDto {
  @IsIn(['REQUIRED', 'REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SIGNED', 'WAIVED'])
  status!: string;

  @IsOptional() @IsString()
  reason?: string;
}

export class CancelHiringContractDto {
  @IsString()
  reason!: string;
}

export class ListHiringContractsDto {
  @IsOptional() @IsString()
  branchId?: string;

  @IsOptional() @IsIn(['DRAFT', 'DATA_REVIEW', 'OFFER_PREPARATION', 'OFFER_SENT', 'AWAITING_OFFER_RESPONSE', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', 'SIGNATURES_PENDING', 'COMPLIANCE_REVIEW', 'READY_TO_HIRE', 'HIRED', 'CANCELLED'])
  status?: string;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  responsibleUserId?: string;

  @IsOptional() @IsString()
  roleTitle?: string;

  @IsOptional() @IsString()
  fromDate?: string;

  @IsOptional() @IsString()
  toDate?: string;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  blocked?: boolean;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  attentionRequired?: boolean;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  waitingCandidate?: boolean;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}

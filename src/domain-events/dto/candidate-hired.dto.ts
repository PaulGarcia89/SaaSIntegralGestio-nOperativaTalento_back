import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DomainEventBaseDto } from './domain-event-base.dto';

export class CandidateHiredDto extends DomainEventBaseDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  employeeName?: string;

  @IsOptional()
  @IsEmail()
  employeeEmail?: string;
}

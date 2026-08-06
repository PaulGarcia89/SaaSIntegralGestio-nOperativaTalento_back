import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DomainEventBaseDto } from './domain-event-base.dto';

export class AtsAutomationEventDto extends DomainEventBaseDto {
  @IsUUID()
  applicationId!: string;

  @IsOptional()
  @IsUUID()
  vacancyId?: string;

  @IsOptional()
  @IsUUID()
  interviewId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stageCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;
}

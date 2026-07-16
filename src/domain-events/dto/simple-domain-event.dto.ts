import { IsUUID } from 'class-validator';
import { DomainEventBaseDto } from './domain-event-base.dto';

export class SimpleDomainEventDto extends DomainEventBaseDto {
  @IsUUID()
  employeeId!: string;
}

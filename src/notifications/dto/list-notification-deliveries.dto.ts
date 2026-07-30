import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListNotificationDeliveriesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationDeliveryStatus)
  status?: NotificationDeliveryStatus;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
}

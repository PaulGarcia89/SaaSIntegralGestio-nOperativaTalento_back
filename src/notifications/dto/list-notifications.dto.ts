import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListNotificationsDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true'))
  @IsBoolean()
  unreadOnly?: boolean;
}

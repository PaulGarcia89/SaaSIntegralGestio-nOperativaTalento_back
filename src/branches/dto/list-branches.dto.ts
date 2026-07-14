import { IsOptional, IsString, MaxLength } from 'class-validator';
import { OffsetPaginationQueryDto } from '../../common/dto/offset-pagination-query.dto';

export class ListBranchesDto extends OffsetPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

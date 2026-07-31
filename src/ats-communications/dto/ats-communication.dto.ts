import { AtsCommunicationAudience, AtsCommunicationType } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateAtsCommunicationTemplateDto {
  @IsOptional()
  @IsUUID()
  vacancyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stageCode?: string;

  @IsEnum(AtsCommunicationType)
  type!: AtsCommunicationType;

  @IsEnum(AtsCommunicationAudience)
  audience!: AtsCommunicationAudience;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(240)
  subject!: string;

  @IsString()
  @MaxLength(12000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SendOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  message?: string;
}

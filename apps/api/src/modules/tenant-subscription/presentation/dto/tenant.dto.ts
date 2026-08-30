import { IsIn, IsString, IsBoolean } from 'class-validator';

export class ConfigurePlanDto {
  @IsIn(['starter', 'professional', 'enterprise'])
  plan!: string;
}

export class SetFeatureFlagDto {
  @IsString()
  key!: string;

  @IsBoolean()
  enabled!: boolean;
}

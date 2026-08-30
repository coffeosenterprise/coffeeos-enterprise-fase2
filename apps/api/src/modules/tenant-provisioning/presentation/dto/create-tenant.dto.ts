import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OwnerBootstrapDto {
  @IsEmail()
  email!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug solo puede contener minusculas, numeros y guiones',
  })
  slug!: string;

  @IsOptional()
  @IsIn(['starter', 'professional', 'enterprise'])
  plan?: string;

  @ValidateNested()
  @Type(() => OwnerBootstrapDto)
  owner!: OwnerBootstrapDto;
}

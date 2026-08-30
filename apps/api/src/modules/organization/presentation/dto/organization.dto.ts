import { IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class CreateBranchDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateTerminalDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;
}

export class AssignUserDto {
  @IsString()
  userId!: string;
}

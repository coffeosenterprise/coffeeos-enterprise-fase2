import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  terminalId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingAmount!: number;
}

export class CloseCashSessionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedCash!: number;
}

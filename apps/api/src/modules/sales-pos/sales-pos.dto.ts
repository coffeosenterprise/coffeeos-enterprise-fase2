import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @IsUUID('4', { each: true })
  modifierOptionIds!: string[];
}

export class CreateSaleDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  terminalId!: string;

  @IsUUID()
  cashSessionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cashReceived!: number;
}

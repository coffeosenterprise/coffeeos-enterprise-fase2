import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000)
  quantity!: number;

  @IsArray()
  @ArrayMaxSize(50)
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
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  cashReceived!: number;
}

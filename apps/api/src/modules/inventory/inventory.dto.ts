import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateIngredientDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minQuantity!: number;
}

export class RestockDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateInventoryStockDto {
  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minQuantity!: number;
}

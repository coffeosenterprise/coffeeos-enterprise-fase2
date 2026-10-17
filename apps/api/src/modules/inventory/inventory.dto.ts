import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateIngredientDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  minQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  initialUnitCost?: number;
}

export class RestockDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(1_000_000_000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class InventoryMovementDto {
  @IsString()
  @IsIn(['entrada', 'salida', 'ajuste', 'merma'])
  type!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(1_000_000_000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class UpdateInventoryStockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  minQuantity!: number;
}

export class InventoryRecipeItemDto {
  @IsUUID()
  ingredientId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(1_000_000_000)
  quantity!: number;
}

export class SaveInventoryRecipeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsUUID()
  outputIngredientId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  @Max(1_000_000_000)
  outputQuantity!: number;

  @IsOptional()
  @IsString()
  @IsIn(['auto_on_sale', 'hybrid', 'manual_prep'])
  deductMode?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryRecipeItemDto)
  items!: InventoryRecipeItemDto[];
}

export class ExecuteInventoryRecipeDto {
  @IsUUID()
  branchId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(1_000_000_000)
  batches!: number;
}

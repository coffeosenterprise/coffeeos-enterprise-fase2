import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { getTenantContext } from '../../common/tenant/tenant-context';
import type {
  CreateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
} from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.withTenantContext((tx) =>
      tx.category.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          products: {
            where: { active: true },
            orderBy: { name: 'asc' },
            include: {
              ingredients: { include: { ingredient: true } },
              modifierGroups: {
                where: { options: { some: { active: true } } },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                include: {
                  options: {
                    where: { active: true },
                    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                    include: {
                      ingredients: { include: { ingredient: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
  }

  createCategory(dto: CreateCategoryDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext((tx) =>
      tx.category.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          color: dto.color ?? '#C87B45',
          sortOrder: dto.sortOrder ?? 0,
        },
      }),
    );
  }

  createProduct(dto: CreateProductDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: dto.categoryId, active: true },
      });
      if (!category) throw new NotFoundException('Categoria no encontrada');

      const ingredientIds = new Set<string>();
      for (const ingredient of dto.ingredients ?? []) {
        ingredientIds.add(ingredient.ingredientId);
      }
      for (const group of dto.modifierGroups ?? []) {
        const min = group.required
          ? Math.max(group.minSelections ?? 1, 1)
          : group.minSelections ?? 0;
        const max = group.maxSelections ?? 1;
        if (max < min || max > group.options.length) {
          throw new BadRequestException(
            `La configuracion del grupo "${group.name}" no es valida`,
          );
        }
        for (const option of group.options) {
          for (const ingredient of option.ingredients ?? []) {
            ingredientIds.add(ingredient.ingredientId);
          }
        }
      }

      if (ingredientIds.size > 0) {
        const found = await tx.ingredient.count({
          where: { id: { in: [...ingredientIds] }, active: true },
        });
        if (found !== ingredientIds.size) {
          throw new BadRequestException(
            'Una o mas recetas usan ingredientes inexistentes',
          );
        }
      }

      const product = await tx.product.create({
        data: {
          tenantId,
          categoryId: dto.categoryId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          price: dto.price,
        },
      });

      if ((dto.ingredients ?? []).length > 0) {
        await tx.productIngredient.createMany({
          data: (dto.ingredients ?? []).map((ingredient) => ({
            tenantId,
            productId: product.id,
            ingredientId: ingredient.ingredientId,
            quantity: ingredient.quantity,
          })),
        });
      }

      for (const [groupIndex, group] of (dto.modifierGroups ?? []).entries()) {
        const createdGroup = await tx.modifierGroup.create({
          data: {
            tenantId,
            productId: product.id,
            name: group.name.trim(),
            required: group.required ?? false,
            minSelections: group.required
              ? Math.max(group.minSelections ?? 1, 1)
              : group.minSelections ?? 0,
            maxSelections: group.maxSelections ?? 1,
            sortOrder: groupIndex,
          },
        });

        for (const [optionIndex, option] of group.options.entries()) {
          const createdOption = await tx.modifierOption.create({
            data: {
              tenantId,
              groupId: createdGroup.id,
              name: option.name.trim(),
              priceDelta: option.priceDelta,
              sortOrder: optionIndex,
            },
          });
          if ((option.ingredients ?? []).length > 0) {
            await tx.modifierOptionIngredient.createMany({
              data: (option.ingredients ?? []).map((ingredient) => ({
                tenantId,
                modifierOptionId: createdOption.id,
                ingredientId: ingredient.ingredientId,
                quantity: ingredient.quantity,
              })),
            });
          }
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: {
          ingredients: { include: { ingredient: true } },
          modifierGroups: {
            where: { options: { some: { active: true } } },
            include: {
              options: {
                where: { active: true },
                include: { ingredients: { include: { ingredient: true } } },
              },
            },
          },
        },
      });
    });
  }

  updateProduct(productId: string, dto: UpdateProductDto) {
    const { tenantId } = getTenantContext();
    return this.prisma.withTenantContext(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, active: true },
      });
      if (!product) throw new NotFoundException('Producto no encontrado');

      const category = await tx.category.findFirst({
        where: { id: dto.categoryId, active: true },
      });
      if (!category) throw new NotFoundException('Categoria no encontrada');

      const ingredientIds = new Set<string>();
      for (const ingredient of dto.ingredients ?? []) {
        ingredientIds.add(ingredient.ingredientId);
      }
      for (const group of dto.modifierGroups ?? []) {
        const min = group.required
          ? Math.max(group.minSelections ?? 1, 1)
          : group.minSelections ?? 0;
        const max = group.maxSelections ?? 1;
        if (max < min || max > group.options.length) {
          throw new BadRequestException(
            `La configuracion del grupo "${group.name}" no es valida`,
          );
        }
        for (const option of group.options) {
          for (const ingredient of option.ingredients ?? []) {
            ingredientIds.add(ingredient.ingredientId);
          }
        }
      }

      if (ingredientIds.size > 0) {
        const found = await tx.ingredient.count({
          where: { id: { in: [...ingredientIds] }, active: true },
        });
        if (found !== ingredientIds.size) {
          throw new BadRequestException(
            'Una o mas recetas usan ingredientes inexistentes',
          );
        }
      }

      const existingGroups = await tx.modifierGroup.findMany({
        where: { productId: product.id },
        include: { options: true },
      });
      const existingGroupById = new Map(
        existingGroups.map((group) => [group.id, group]),
      );
      const existingGroupByName = new Map(
        existingGroups.map((group) => [group.name, group]),
      );

      await tx.product.update({
        where: { id: product.id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          price: dto.price,
        },
      });

      await tx.productIngredient.deleteMany({
        where: { productId: product.id },
      });
      if ((dto.ingredients ?? []).length > 0) {
        await tx.productIngredient.createMany({
          data: (dto.ingredients ?? []).map((ingredient) => ({
            tenantId,
            productId: product.id,
            ingredientId: ingredient.ingredientId,
            quantity: ingredient.quantity,
          })),
        });
      }

      const keptGroupIds = new Set<string>();
      for (const [groupIndex, group] of (dto.modifierGroups ?? []).entries()) {
        const existingGroup = group.id
          ? existingGroupById.get(group.id)
          : existingGroupByName.get(group.name.trim());
        if (group.id && !existingGroup) {
          throw new BadRequestException(
            'Un grupo de opciones no pertenece a este producto',
          );
        }

        const minSelections = group.required
          ? Math.max(group.minSelections ?? 1, 1)
          : group.minSelections ?? 0;
        const savedGroup = existingGroup
          ? await tx.modifierGroup.update({
              where: { id: existingGroup.id },
              data: {
                name: group.name.trim(),
                required: group.required ?? false,
                minSelections,
                maxSelections: group.maxSelections ?? 1,
                sortOrder: groupIndex,
              },
            })
          : await tx.modifierGroup.create({
              data: {
                tenantId,
                productId: product.id,
                name: group.name.trim(),
                required: group.required ?? false,
                minSelections,
                maxSelections: group.maxSelections ?? 1,
                sortOrder: groupIndex,
              },
            });
        keptGroupIds.add(savedGroup.id);

        const previousOptions = existingGroup?.options ?? [];
        const previousOptionById = new Map(
          previousOptions.map((option) => [option.id, option]),
        );
        const previousOptionByName = new Map(
          previousOptions.map((option) => [option.name, option]),
        );
        const keptOptionIds = new Set<string>();

        for (const [optionIndex, option] of group.options.entries()) {
          const existingOption = option.id
            ? previousOptionById.get(option.id)
            : previousOptionByName.get(option.name.trim());
          if (option.id && !existingOption) {
            throw new BadRequestException(
              'Una opcion no pertenece al grupo indicado',
            );
          }

          const savedOption = existingOption
            ? await tx.modifierOption.update({
                where: { id: existingOption.id },
                data: {
                  name: option.name.trim(),
                  priceDelta: option.priceDelta,
                  active: true,
                  sortOrder: optionIndex,
                },
              })
            : await tx.modifierOption.create({
                data: {
                  tenantId,
                  groupId: savedGroup.id,
                  name: option.name.trim(),
                  priceDelta: option.priceDelta,
                  sortOrder: optionIndex,
                },
              });
          keptOptionIds.add(savedOption.id);

          await tx.modifierOptionIngredient.deleteMany({
            where: { modifierOptionId: savedOption.id },
          });
          if ((option.ingredients ?? []).length > 0) {
            await tx.modifierOptionIngredient.createMany({
              data: (option.ingredients ?? []).map((ingredient) => ({
                tenantId,
                modifierOptionId: savedOption.id,
                ingredientId: ingredient.ingredientId,
                quantity: ingredient.quantity,
              })),
            });
          }
        }

        await tx.modifierOption.updateMany({
          where: {
            groupId: savedGroup.id,
            id: { notIn: [...keptOptionIds] },
          },
          data: { active: false },
        });
      }

      for (const group of existingGroups) {
        if (keptGroupIds.has(group.id)) continue;
        await tx.modifierGroup.update({
          where: { id: group.id },
          data: { required: false, minSelections: 0, maxSelections: 1 },
        });
        await tx.modifierOption.updateMany({
          where: { groupId: group.id },
          data: { active: false },
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: {
          ingredients: { include: { ingredient: true } },
          modifierGroups: {
            where: { options: { some: { active: true } } },
            orderBy: { sortOrder: 'asc' },
            include: {
              options: {
                where: { active: true },
                orderBy: { sortOrder: 'asc' },
                include: { ingredients: { include: { ingredient: true } } },
              },
            },
          },
        },
      });
    });
  }
}

import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export class ApiErrorDetail {
  @ApiProperty({ example: 'BRAND_NOT_FOUND' })
  code: string;

  @ApiPropertyOptional({ type: Object })
  details?: unknown;
}

export class ApiErrorResponse {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 'Brand not found' })
  message: string;

  @ApiProperty({ type: ApiErrorDetail })
  error: ApiErrorDetail;
}

export class ApiPaginationMeta {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 100 }) total: number;
  @ApiProperty({ example: 5 }) totalPages: number;
}

/** Documents a standard success envelope `{ success, message, data: T, meta }`. */
export const ApiEnvelope = <T extends Type<unknown>>(model?: T, options: { isArray?: boolean; description?: string } = {}) => {
  const dataSchema = model
    ? options.isArray
      ? { type: 'array', items: { $ref: getSchemaPath(model) } }
      : { $ref: getSchemaPath(model) }
    : { type: 'object', nullable: true };
  return applyDecorators(
    ApiExtraModels(...(model ? [model] : []), ApiErrorResponse),
    ApiOkResponse({
      description: options.description ?? 'Success',
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: dataSchema,
          meta: { type: 'object' },
        },
      },
    }),
    ApiBadRequestResponse({ type: ApiErrorResponse, description: 'Validation or business rule error' }),
    ApiUnauthorizedResponse({ type: ApiErrorResponse, description: 'Missing/invalid/expired access token' }),
  );
};

/** Documents a paginated success envelope with pagination meta. */
export const ApiPaginatedEnvelope = <T extends Type<unknown>>(model: T) =>
  applyDecorators(
    ApiExtraModels(model, ApiPaginationMeta, ApiErrorResponse),
    ApiOkResponse({
      description: 'Paginated list',
      schema: {
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'OK' },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(ApiPaginationMeta) },
        },
      },
    }),
    ApiUnauthorizedResponse({ type: ApiErrorResponse }),
  );

export const ApiStandardErrors = () =>
  applyDecorators(
    ApiForbiddenResponse({ type: ApiErrorResponse, description: 'No access to this brand/resource' }),
    ApiNotFoundResponse({ type: ApiErrorResponse, description: 'Resource not found' }),
  );

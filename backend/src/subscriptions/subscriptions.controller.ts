import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AuditService } from '../audit/audit.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ReqMeta, RequestMeta } from '../common/utils/request-meta';
import { AssignPlanDto, UpsertPlanDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'List available plans with their configurable limits' })
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @ApiBearerAuth()
  @Get('current')
  @ApiOperation({ summary: 'Current plan, limits and live usage for the authenticated account' })
  current(@CurrentUser() user: AuthUser) {
    return this.subscriptions.getCurrent(user.id);
  }

  @ApiBearerAuth()
  @RequirePermissions('plans.manage')
  @Get('admin/plans')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiOperation({ summary: '[Admin] List all plans' })
  adminPlans(@Query('includeInactive') includeInactive?: string) {
    return this.subscriptions.listPlans(includeInactive === 'true');
  }

  @ApiBearerAuth()
  @RequirePermissions('plans.manage')
  @Put('admin/plans')
  @ResponseMessage('Plan saved')
  @ApiOperation({ summary: '[Admin] Create or update a plan and its usage limits' })
  upsertPlan(@Body() dto: UpsertPlanDto) {
    return this.subscriptions.upsertPlan(dto);
  }

  @ApiBearerAuth()
  @RequirePermissions('subscriptions.manage')
  @Get('admin/accounts')
  @ApiOperation({ summary: '[Admin] Accounts with their current plan and this month\'s AI usage' })
  accounts(@Query() query: PaginationQueryDto) {
    return this.subscriptions.listAccounts(query);
  }

  @ApiBearerAuth()
  @RequirePermissions('subscriptions.manage')
  @Post('admin/assign')
  @ResponseMessage('Plan assigned')
  @ApiOperation({ summary: '[Admin] Assign a plan to a user (hook for billing webhooks)' })
  async assign(@CurrentUser() admin: AuthUser, @Body() dto: AssignPlanDto, @ReqMeta() meta: RequestMeta) {
    const subscription = await this.subscriptions.assignPlan(dto);
    await this.audit.log({
      action: 'admin.subscription.assign',
      userId: admin.id,
      entityType: 'subscription',
      entityId: subscription.id,
      metadata: { accountId: dto.userId, planCode: dto.planCode },
      ...meta,
    });
    return subscription;
  }
}

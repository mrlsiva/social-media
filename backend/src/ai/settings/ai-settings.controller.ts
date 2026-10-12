import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ApiStandardErrors } from '../../common/swagger/api-responses';
import { ReqMeta, RequestMeta } from '../../common/utils/request-meta';
import { RoutingTextProvider } from '../providers/routing.providers';
import { AI_PROVIDER_IDS } from './ai-settings.constants';
import { TestAiProviderDto, UpdateAiSettingsDto } from './ai-settings.dto';
import { AiSettingsService, AiSettingsView } from './ai-settings.service';

@ApiTags('Admin')
@ApiBearerAuth()
@ApiStandardErrors()
@RequirePermissions('settings.manage')
@Controller('admin/ai-settings')
export class AiSettingsController {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly text: RoutingTextProvider,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: '[Admin] AI provider selection, models and key status (keys are masked)' })
  get(): AiSettingsView {
    return this.settings.view();
  }

  @Put()
  @ResponseMessage('AI settings saved')
  @ApiOperation({ summary: '[Admin] Update AI providers, models and API keys. Takes effect immediately.' })
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAiSettingsDto, @ReqMeta() meta: RequestMeta): Promise<AiSettingsView> {
    const { textProvider, imageProvider, videoProvider } = dto;
    const providers = Object.fromEntries(AI_PROVIDER_IDS.filter((id) => dto[id]).map((id) => [id, { ...dto[id] }]));
    const { view, changedKeys } = await this.settings.update({ textProvider, imageProvider, videoProvider, providers }, user.id);
    // Key names only - never the values.
    await this.audit.log({ action: 'admin.ai_settings.update', userId: user.id, entityType: 'app_settings', metadata: { changedKeys }, ...meta });
    return view;
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '[Admin] Send a tiny text request with the saved settings of one provider' })
  async test(@Body() dto: TestAiProviderDto): Promise<{ ok: boolean; model: string; latencyMs: number; message: string }> {
    const provider = this.text.get(dto.provider);
    const started = Date.now();
    try {
      await provider.completeJson<{ ok?: boolean }>({
        system: 'You are a connectivity check for an API integration.',
        user: 'Reply with exactly this JSON object: {"ok": true}',
        temperature: 0,
        maxTokens: 200,
      });
      return { ok: true, model: provider.model, latencyMs: Date.now() - started, message: 'Connection works' };
    } catch (err) {
      return { ok: false, model: provider.model, latencyMs: Date.now() - started, message: (err as Error).message };
    }
  }
}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from '../brands/entities/brand.entity';
import { QUEUES } from '../common/queues';
import { AiController } from './ai.controller';
import { AiGenerationsService } from './ai-generations.service';
import { AIImageService } from './ai-image.service';
import { AiProcessor } from './ai.processor';
import { AiTextService } from './ai-text.service';
import { AIVideoService } from './ai-video.service';
import { AiGeneration } from './entities/ai-generation.entity';
import { AiGenerationUsage } from './entities/ai-generation-usage.entity';
import { AI_IMAGE_PROVIDER, AI_TEXT_PROVIDER, AI_VIDEO_PROVIDER } from './providers/ai-provider.interfaces';
import { CustomAiClient } from './providers/custom/custom.client';
import { CustomImageProvider } from './providers/custom/custom-image.provider';
import { CustomTextProvider } from './providers/custom/custom-text.provider';
import { NvidiaClient } from './providers/nvidia/nvidia.client';
import { NvidiaImageProvider } from './providers/nvidia/nvidia-image.provider';
import { NvidiaTextProvider } from './providers/nvidia/nvidia-text.provider';
import { OpenAiClient } from './providers/openai/openai.client';
import { OpenAiImageProvider } from './providers/openai/openai-image.provider';
import { OpenAiTextProvider } from './providers/openai/openai-text.provider';
import { OpenAiVideoProvider } from './providers/openai/openai-video.provider';
import { RoutingImageProvider, RoutingTextProvider } from './providers/routing.providers';
import { AiSettingsController } from './settings/ai-settings.controller';
import { AiSettingsService } from './settings/ai-settings.service';
import { AppSetting } from './settings/app-setting.entity';

/**
 * Providers are chosen at runtime from AiSettingsService (Admin > AI providers,
 * falling back to .env). To add one: implement the interface, add its id to
 * ai-settings.constants.ts and register it in routing.providers.ts.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiGeneration, AiGenerationUsage, Brand, AppSetting]), BullModule.registerQueue({ name: QUEUES.AI })],
  controllers: [AiController, AiSettingsController],
  providers: [
    AiSettingsService,
    OpenAiClient,
    OpenAiTextProvider,
    OpenAiImageProvider,
    OpenAiVideoProvider,
    NvidiaClient,
    NvidiaTextProvider,
    NvidiaImageProvider,
    CustomAiClient,
    CustomTextProvider,
    CustomImageProvider,
    RoutingTextProvider,
    RoutingImageProvider,
    { provide: AI_TEXT_PROVIDER, useExisting: RoutingTextProvider },
    { provide: AI_IMAGE_PROVIDER, useExisting: RoutingImageProvider },
    // Video generation is OpenAI (Sora) only for now.
    { provide: AI_VIDEO_PROVIDER, useExisting: OpenAiVideoProvider },
    AiGenerationsService,
    AiTextService,
    AIImageService,
    AIVideoService,
    AiProcessor,
  ],
  exports: [AiTextService, AiGenerationsService, AIImageService, AIVideoService],
})
export class AiModule {}

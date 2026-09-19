import type { ProtocolEndpoint, ProviderConnection } from '#/llm/protocol/connection';
import type { ContentPart, ToolDescription } from '#/llm/message';
import { providerImagePolicy } from '#/llm/media/image-formats';
import { CONTEXT_MANAGEMENT_BETA } from '#/llm/requester/bases/anthropic/contract';
import type { AnthropicTrait } from '#/llm/requester/bases/anthropic/trait';
import type {
  OpenAIRawUsage,
  OpenAIWireMessage,
  OpenAIWireToolCall,
} from '#/llm/requester/bases/openai/contract';
import type { OpenAITrait } from '#/llm/requester/bases/openai/trait';

import { normalizeFloydToolSchema } from './schema';

export const FLOYD_API_KEY_ENV = 'FLOYD_API_KEY';
export const FLOYD_BASE_URL_ENV = 'FLOYD_BASE_URL';
export const FLOYD_DEFAULT_BASE_URL = 'https://api.legacy.ai/v1';

const floydEndpoint: ProtocolEndpoint = {
  apiKeyEnv: FLOYD_API_KEY_ENV,
  baseUrlEnv: FLOYD_BASE_URL_ENV,
  defaultBaseUrl: FLOYD_DEFAULT_BASE_URL,
};

export const floydConnection: ProviderConnection = {
  endpoint: () => floydEndpoint,
};

export interface FloydThinkingConfig {
  type?: 'enabled' | 'disabled';
  effort?: string;
  keep?: unknown;
  [key: string]: unknown;
}

function isEffectivelyEmptyContent(parts: readonly ContentPart[]): boolean {
  for (const part of parts) {
    if (part.type !== 'text') {
      return false;
    }
    if (part.text.trim() !== '') {
      return false;
    }
  }
  return true;
}

function convertFloydTool(tool: ToolDescription): Record<string, unknown> {
  if (tool.name.startsWith('$')) {
    return {
      type: 'builtin_function',
      function: { name: tool.name },
    };
  }
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeFloydToolSchema(tool.parameters),
    },
  };
}

const floydAcceptedImageMimes = (): ReadonlySet<string> => providerImagePolicy('floyd').acceptedMimes;

export const floydOpenAITrait: OpenAITrait = {
  strictThinkingValidation: true,

  toolMessageConversion: 'keep_parts',

  encodeCacheKey: (key) => ({ prompt_cache_key: key }),

  thinking: (thinking) => {
    const config: FloydThinkingConfig =
      thinking.effort === 'off'
        ? { type: 'disabled' }
        : thinking.effort === 'on'
          ? { type: 'enabled' }
          : { type: 'enabled', effort: thinking.effort };
    if (thinking.keep !== undefined) {
      config.keep = thinking.keep;
    }
    return {
      kwargs: { thinking: config },
      preserveThinking: thinking.keep === 'all' && thinking.effort !== 'off' ? true : undefined,
    };
  },

  encodeMaxCompletionTokens: (maxCompletionTokens) => ({
    max_completion_tokens: maxCompletionTokens,
  }),

  buildParams: (params) => {
    const { extra_body: extraBody, ...rest } = params;
    if (extraBody === undefined || extraBody === null) {
      return params;
    }
    return { ...rest, ...(extraBody as Record<string, unknown>) };
  },

  convertTool: (tool) => convertFloydTool(tool),

  convertMessage: (message, converted) => {
    const record = converted as Partial<OpenAIWireMessage> & Record<string, unknown>;
    if (message.role === 'assistant' && message.toolCalls.length > 0) {
      const nonThinkParts = message.content.filter((part) => part.type !== 'think');
      if (isEffectivelyEmptyContent(nonThinkParts)) {
        delete record['content'];
      }
    }

    if (message.role === 'system' && message.tools !== undefined && message.tools.length > 0) {
      record['tools'] = message.tools.map((tool) => convertFloydTool(tool));
    }

    const convertedToolCalls = record['tool_calls'];
    if (message.role === 'assistant' && Array.isArray(convertedToolCalls)) {
      message.toolCalls.forEach((toolCall, index) => {
        if (toolCall.extras === undefined) {
          return;
        }
        const out: (OpenAIWireToolCall & { extras?: unknown }) | undefined =
          convertedToolCalls[index];
        if (out !== undefined) {
          out.extras = toolCall.extras;
        }
      });
    }

    return converted;
  },

  extractUsage: (chunk) => {
    const topLevel = chunk.usage;
    if (topLevel !== null && topLevel !== undefined && typeof topLevel === 'object') {
      return topLevel;
    }
    const firstChoice = chunk.choices?.[0] as { usage?: OpenAIRawUsage | null } | undefined;
    const choiceUsage = firstChoice?.usage;
    if (choiceUsage !== null && choiceUsage !== undefined && typeof choiceUsage === 'object') {
      return choiceUsage;
    }
    return undefined;
  },
};

export const floydAnthropicTrait: AnthropicTrait = {
  acceptedImageMimes: floydAcceptedImageMimes,

  thinking: (thinking) => {
    if (thinking.effort === 'off') {
      return { kwargs: { thinking: { type: 'disabled' }, betaFeatures: [CONTEXT_MANAGEMENT_BETA] } };
    }
    return {
      kwargs: {
        thinking: { type: 'enabled' },
        output_config: thinking.effort === 'on' ? undefined : { effort: thinking.effort },
        betaFeatures: [CONTEXT_MANAGEMENT_BETA],
      },
    };
  },
};

import { z, ZodSchema } from 'zod';
import { ToolDefinition, ToolExecutionContext } from '../types';

export type RegisteredTool = ToolDefinition<any>;

const builtinTools: Map<string, RegisteredTool> = new Map();

function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return schema;
}

export function registerTool<TParams extends Record<string, unknown>>(
  tool: ToolDefinition<TParams>,
): ToolDefinition<TParams> {
  builtinTools.set(tool.name, {
    ...tool,
    inputSchema: normalizeSchema(tool.inputSchema),
    handler: tool.handler as (params: Record<string, unknown>, context?: ToolExecutionContext) => Promise<unknown>,
  });
  return tool;
}

export function getToolRegistry() {
  return {
    list(): RegisteredTool[] {
      return Array.from(builtinTools.values());
    },
    listNames(): string[] {
      return Array.from(builtinTools.keys());
    },
    get(name: string): RegisteredTool | undefined {
      return builtinTools.get(name);
    },
    validate(name: string, params: Record<string, unknown>): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
      const tool = builtinTools.get(name);
      if (!tool) {
        return { success: false, error: `Unknown tool: ${name}` };
      }
      const schema = tool.inputSchema as Record<string, unknown>;
      if (!schema || Object.keys(schema).length === 0) {
        return { success: true, data: params };
      }
      try {
        const zodSchema = z.object(schema as any) as ZodSchema<Record<string, unknown>>;
        const parsed = zodSchema.parse(params);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid tool parameters';
        return { success: false, error: message };
      }
    },
    execute(name: string, params: Record<string, unknown>, context?: ToolExecutionContext): Promise<unknown> {
      const tool = builtinTools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return tool.handler(params, context);
    },
    registerMcpTool(tool: RegisteredTool): RegisteredTool {
      builtinTools.set(tool.name, tool);
      return tool;
    },
  };
}

const baseCapabilities = [
  'open_application',
  'set_wallpaper',
  'run_shell_command',
  'browser_open',
  'browser_fill',
  'browser_click',
  'browser_read_page',
  'browser_extract_results',
  'browser_wait_for_element',
  'browser_get_page_state',
  'browser_screenshot',
  'type_text',
  'create_file',
  'create_folder',
  'wait',
  'download_file',
  'app_find_window',
  'app_focus_window',
  'app_click',
  'app_type',
  'whatsapp_send',
  'whatsapp_get_chats',
  'whatsapp_call',
] as const;

for (const name of baseCapabilities) {
  registerTool({
    name,
    description: `Built-in capability: ${name}`,
    inputSchema: {},
    source: 'builtin',
    handler: async () => ({ ok: true, tool: name }),
  });
}

export const toolRegistry = getToolRegistry();

import { Session, Agent, ApiProvider, ProviderConfig } from '../store';

export type ExportFormat = 'json' | 'markdown';

export interface ExportOptions {
  format: ExportFormat;
  includeHistory: boolean;
  includeAgents: boolean;
  includeSettings: boolean;
}

export interface ExportData {
  version: string;
  exportDate: string;
  sessions?: Session[];
  agents?: Agent[];
  settings?: {
    apiProvider: ApiProvider;
    providerConfigs: Partial<Record<ApiProvider, Omit<ProviderConfig, 'apiKey'> & { apiKey: '' }>>;
  };
}

/** Triggers a file download in the browser */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exports selected data as a formatted JSON string */
export function exportAsJSON(
  sessions: Session[],
  agents: Agent[],
  settings: { apiProvider: ApiProvider; providerConfigs: Record<ApiProvider, ProviderConfig> },
  options: ExportOptions
): string {
  const data: ExportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
  };

  if (options.includeHistory) {
    data.sessions = sessions;
  }

  if (options.includeAgents) {
    data.agents = agents;
  }

  if (options.includeSettings) {
    // Strip API keys before export for security
    data.settings = {
      apiProvider: settings.apiProvider,
      providerConfigs: Object.fromEntries(
        Object.entries(settings.providerConfigs).map(([k, v]) => [
          k,
          { ...v, apiKey: '' as const },
        ])
      ) as Partial<Record<ApiProvider, Omit<ProviderConfig, 'apiKey'> & { apiKey: '' }>>,
    };
  }

  return JSON.stringify(data, null, 2);
}

/** Formats a timestamp as a readable date string */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Exports selected data as a Markdown string */
export function exportAsMarkdown(
  sessions: Session[],
  agents: Agent[],
  options: ExportOptions
): string {
  const lines: string[] = [];
  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  lines.push('# Chat Export — LuminaSider');
  lines.push('');
  lines.push(`**Export Date**: ${exportDate}`);

  if (options.includeHistory && sessions.length > 0) {
    lines.push(`**Total Sessions**: ${sessions.length}`);
    lines.push('');
    lines.push('---');

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      let agentName = 'Default';

      if (session.agentId && options.includeAgents) {
        const agent = agents.find((a) => a.id === session.agentId);
        if (agent) agentName = agent.name;
      }

      lines.push('');
      lines.push(`## Session ${i + 1}: ${session.title}`);
      lines.push('');
      lines.push(`**Date**: ${formatDate(session.updatedAt)}`);
      lines.push(`**Agent**: ${agentName}`);
      lines.push('');

      if (session.messages.length === 0) {
        lines.push('_No messages in this session._');
        lines.push('');
      } else {
        for (let j = 0; j < session.messages.length; j++) {
          const msg = session.messages[j];
          const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';

          lines.push(`### ${role}`);
          lines.push('');
          lines.push(msg.content);
          lines.push('');

          if (msg.attachedContext) {
            lines.push(`> 📄 **Page Context**: [${msg.attachedContext.title}](${msg.attachedContext.url})`);
            lines.push('');
          }
        }
      }

      if (i < sessions.length - 1) {
        lines.push('---');
      }
    }
  } else if (options.includeHistory) {
    lines.push('');
    lines.push('_No sessions to export._');
  }

  if (options.includeAgents) {
    const customAgents = agents.filter((a) => !a.isBuiltIn);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Custom Agents');
    lines.push('');

    if (customAgents.length === 0) {
      lines.push('_No custom agents defined._');
    } else {
      for (const agent of customAgents) {
        lines.push(`### ${agent.name}`);
        lines.push('');
        lines.push(`**System Prompt**:`);
        lines.push('');
        lines.push('```');
        lines.push(agent.systemPrompt);
        lines.push('```');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

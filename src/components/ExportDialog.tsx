import { useState } from 'react';
import { X, Download, FileJson, FileText, CheckSquare, Square } from 'lucide-react';
import { useStore } from '../store';
import {
  ExportFormat,
  ExportOptions,
  exportAsJSON,
  exportAsMarkdown,
  downloadFile,
} from '../utils/exportUtils';

interface ExportDialogProps {
  onClose: () => void;
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const { sessions, agents, apiProvider, providerConfigs } = useStore();

  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includeAgents, setIncludeAgents] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const options: ExportOptions = {
    format,
    includeHistory,
    includeAgents,
    includeSettings,
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        const content = exportAsJSON(sessions, agents, { apiProvider, providerConfigs }, options);
        downloadFile(content, `luminasider-export-${timestamp}.json`, 'application/json');
      } else {
        const content = exportAsMarkdown(sessions, agents, options);
        downloadFile(content, `luminasider-export-${timestamp}.md`, 'text/markdown');
      }
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const CheckboxRow = ({
    checked,
    onChange,
    label,
    description,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description: string;
  }) => (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
    >
      <span className="mt-0.5 shrink-0 text-accent">
        {checked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-400" />}
      </span>
      <span>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
        <span className="block text-xs text-gray-500 dark:text-gray-400">{description}</span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm flex flex-col animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100">导出数据</h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Format Selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              导出格式
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('json')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  format === 'json'
                    ? 'border-accent bg-blue-50 dark:bg-blue-900/20 text-accent'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <FileJson className="w-4 h-4 shrink-0" />
                JSON
              </button>
              <button
                onClick={() => setFormat('markdown')}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  format === 'markdown'
                    ? 'border-accent bg-blue-50 dark:bg-blue-900/20 text-accent'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                Markdown
              </button>
            </div>
          </div>

          {/* Content Selection */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              包含内容
            </p>
            <div className="space-y-0.5">
              <CheckboxRow
                checked={includeHistory}
                onChange={setIncludeHistory}
                label="对话记录"
                description={`${sessions.length} 个会话，包含所有消息`}
              />
              <CheckboxRow
                checked={includeAgents}
                onChange={setIncludeAgents}
                label="自定义助手"
                description="已创建的 AI 助手配置"
              />
              {format === 'json' && (
                <CheckboxRow
                  checked={includeSettings}
                  onChange={setIncludeSettings}
                  label="模型配置"
                  description="接口地址和模型名称（不含 API 密钥）"
                />
              )}
            </div>
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
            🔒 API 密钥不会包含在导出文件中。
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || (!includeHistory && !includeAgents && !includeSettings)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-accent hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            {isExporting ? '导出中...' : '下载'}
          </button>
        </div>
      </div>
    </div>
  );
}

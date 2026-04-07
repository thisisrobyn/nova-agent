import { Zap } from 'lucide-react';
import { formatTokens } from '@/lib/utils';

interface TokenCounterProps {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export function TokenCounter({ inputTokens, outputTokens, totalTokens }: TokenCounterProps) {
  if (!totalTokens && !inputTokens && !outputTokens) return null;

  return (
    <div className="flex items-center gap-2 text-[10px] text-surface-500">
      <Zap className="h-3 w-3 text-primary-600" />
      {inputTokens != null && (
        <span>
          <span className="text-surface-400">{formatTokens(inputTokens)}</span> in
        </span>
      )}
      {outputTokens != null && (
        <span>
          <span className="text-surface-400">{formatTokens(outputTokens)}</span> out
        </span>
      )}
      {totalTokens != null && (
        <span className="font-medium text-primary-600">
          Σ {formatTokens(totalTokens)}
        </span>
      )}
    </div>
  );
}

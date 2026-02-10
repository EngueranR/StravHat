import { useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../api/client';
import { roundIconButtonClass } from './InfoHint';

export interface AiSectionAnalysisPayload {
  page: string;
  sectionKey: string;
  sectionTitle: string;
  sectionSubtitle?: string;
  question?: string;
  context: Record<string, unknown>;
}

interface AiSectionAnalysisResponse {
  model: string;
  generatedAt: string;
  answer: string;
}

interface AIInsightButtonProps {
  token: string | null;
  payload: AiSectionAnalysisPayload;
}

interface ContextOption {
  id: string;
  value: unknown;
}

interface ContextPlan {
  coreContext: Record<string, unknown>;
  options: ContextOption[];
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRegex =
    /(\[[^\]]+\]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let tokenIndex = 0;
  let match: RegExpExecArray | null = tokenRegex.exec(text);

  while (match) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const token = match[0];
    if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${tokenIndex}`}
            className='text-accent underline underline-offset-2 hover:opacity-80'
            href={linkMatch[2]}
            target='_blank'
            rel='noreferrer'
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${tokenIndex}`}
          className='rounded bg-black/10 px-1 py-0.5 text-[12px]'
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = tokenRegex.lastIndex;
    tokenIndex += 1;
    match = tokenRegex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function stripSourcesSection(answer: string) {
  return answer
    .replace(/\n#{2,3}\s*Sources?\b[\s\S]*$/i, '')
    .replace(/\n#{2,3}\s*References?\b[\s\S]*$/i, '')
    .trim();
}

function renderMarkdown(answer: string): ReactNode {
  const lines = answer.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const text = paragraphLines.join(' ').trim();
    if (text.length > 0) {
      blocks.push(
        <p className='text-sm leading-relaxed text-ink' key={`p-${blocks.length}`}>
          {renderInlineMarkdown(text, `p-${blocks.length}`)}
        </p>,
      );
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listItems = [];
      listType = null;
      return;
    }

    if (listType === 'ul') {
      blocks.push(
        <ul className='list-disc space-y-1 pl-5 text-sm text-ink' key={`ul-${blocks.length}`}>
          {listItems.map((item, index) => (
            <li key={`ul-item-${blocks.length}-${index}`}>
              {renderInlineMarkdown(item, `ul-item-${blocks.length}-${index}`)}
            </li>
          ))}
        </ul>,
      );
    } else {
      blocks.push(
        <ol
          className='list-decimal space-y-1 pl-5 text-sm text-ink'
          key={`ol-${blocks.length}`}
        >
          {listItems.map((item, index) => (
            <li key={`ol-item-${blocks.length}-${index}`}>
              {renderInlineMarkdown(item, `ol-item-${blocks.length}-${index}`)}
            </li>
          ))}
        </ol>,
      );
    }

    listItems = [];
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 className='pt-2 text-base font-semibold text-ink' key={`h2-${blocks.length}`}>
          {renderInlineMarkdown(h2Match[1], `h2-${blocks.length}`)}
        </h2>,
      );
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 className='pt-1 text-sm font-semibold text-ink' key={`h3-${blocks.length}`}>
          {renderInlineMarkdown(h3Match[1], `h3-${blocks.length}`)}
        </h3>,
      );
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') {
        flushList();
      }
      listType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') {
        flushList();
      }
      listType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return <div className='space-y-2'>{blocks}</div>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildContextPlan(context: Record<string, unknown>): ContextPlan {
  if (!isRecord(context.graph)) {
    return {
      coreContext: context,
      options: [],
    };
  }

  const graphContext = context.graph;
  const graphCore: Record<string, unknown> = { ...graphContext };
  const optionIds = [
    'comparisonBaseline',
    'heartRateSpecific',
    'strongestPairs',
    'matrixTopRelatedMetrics',
    'distributionShape',
    'distributionDiagnostics',
    'complementarySignals',
    'trendCompanion',
    'selectionProfile',
    'displayedBins',
    'displayedPoints',
    'matrixSample',
  ] as const;

  const options: ContextOption[] = [];
  for (const id of optionIds) {
    const value = graphContext[id];
    if (value === undefined || value === null) {
      continue;
    }
    options.push({
      id,
      value,
    });
    delete graphCore[id];
  }

  return {
    coreContext: {
      ...context,
      graph: graphCore,
    },
    options,
  };
}

export function AIInsightButton({ token, payload }: AIInsightButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiSectionAnalysisResponse | null>(null);

  const payloadFingerprint = useMemo(() => JSON.stringify(payload), [payload]);
  const resolvedQuestion =
    payload.question ?? 'Analyse ce contenu de maniere precise et actionnable.';
  const contextPlan = useMemo(
    () => buildContextPlan(payload.context),
    [payloadFingerprint],
  );
  const composedContext = useMemo(() => {
    const graphCore = contextPlan.coreContext.graph;
    if (!isRecord(graphCore)) {
      return contextPlan.coreContext;
    }

    const graphWithAllContext: Record<string, unknown> = { ...graphCore };
    for (const option of contextPlan.options) {
      graphWithAllContext[option.id] = option.value;
    }

    return {
      ...contextPlan.coreContext,
      graph: graphWithAllContext,
    };
  }, [contextPlan]);

  const runAnalysis = async () => {
    if (!token) {
      setError('Session utilisateur manquante.');
      return;
    }

    const sendPayload: AiSectionAnalysisPayload = {
      ...payload,
      question: resolvedQuestion,
      context: {
        ...composedContext,
        __meta: {
          source: 'AIInsightButton',
          includeAutoContext: true,
          includeAllContextBlocks: true,
          selectedContextBlocks: contextPlan.options.map((option) => option.id),
          requestedAt: new Date().toISOString(),
        },
      },
    };

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<AiSectionAnalysisResponse>(
        '/ai/analyze',
        {
          method: 'POST',
          token,
          body: sendPayload,
        },
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur IA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className={roundIconButtonClass}
        type='button'
        onClick={() => {
          setOpen(true);
          setResult(null);
          setError(null);
          void runAnalysis();
        }}
        title='Analyser avec IA'
      >
        AI
      </button>

      {open ?
        <div className='fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'>
          <div className='max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-black/15 bg-panel shadow-panel'>
            <div className='sticky top-0 z-10 border-b border-black/10 bg-gradient-to-r from-black/[0.06] to-black/[0.01] px-4 py-4 backdrop-blur-sm'>
              <div className='flex items-start justify-between gap-4'>
                <div className='space-y-2'>
                  <p className='inline-flex rounded-full border border-black/20 bg-black/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted'>
                    Insight IA
                  </p>
                  <p className='text-lg font-semibold'>Analyse guidee</p>
                  <p className='text-xs text-muted'>
                    {payload.sectionTitle} ·{' '}
                    {payload.sectionSubtitle ?? payload.sectionKey}
                  </p>
                </div>
                <button
                  className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/20 text-sm transition hover:bg-black/5'
                  type='button'
                  onClick={() => setOpen(false)}
                  aria-label='Fermer la popup IA'
                  title='Fermer'
                >
                  ×
                </button>
              </div>
            </div>

            <div className='space-y-4 p-4'>
              {error ?
                <p className='text-sm text-red-700'>{error}</p>
              : null}
              {loading ?
                <div className='rounded-2xl border border-black/10 bg-black/[0.03] p-4'>
                  <p className='text-sm text-muted'>
                    Analyse en cours... L&apos;IA lit toutes les donnees
                    disponibles et prepare ses conclusions.
                  </p>
                </div>
              : null}

              {!loading && result ?
                <div className='space-y-3'>
                  <div className='max-h-[55vh] overflow-y-auto rounded-2xl border border-black/10 bg-black/[0.03] p-4'>
                    {renderMarkdown(stripSourcesSection(result.answer))}
                  </div>
                </div>
              : null}
            </div>
          </div>
        </div>
      : null}
    </>
  );
}

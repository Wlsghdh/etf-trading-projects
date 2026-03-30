import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { parseScrapingLog } from '@/lib/scraping-log-parser';
import { ScrapingStatus, SymbolScrapingStatus, JobStatus, ScrapingError } from '@/lib/types';
import { SYMBOLS, TIMEFRAMES } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Path to task_info.json (Docker mount - same for dev and prod)
const TASK_INFO_PATH = '/app/logs/task_info.json';

interface TimeframeInfo {
  status: string;
  rows: number;
  error?: string;
  downloaded_at?: string;
  uploaded_at?: string;
}

interface SymbolInfo {
  symbol: string;
  status: string;
  timeframes: Record<string, TimeframeInfo>;
  error?: string;
  start_time?: string;
  end_time?: string;
}

interface RetryTask {
  retry_id: string;
  parent_job_id: string;
  symbols: string[];
  status: string;
  start_time?: string;
  end_time?: string;
}

interface TaskInfoJob {
  job_id: string;
  status: string;
  symbols: Record<string, SymbolInfo>;
  current_symbol?: string;
  current_timeframe?: string;
  start_time?: string;
  end_time?: string;
  total_downloaded: number;
  total_uploaded: number;
  total_rows: number;
  retry_tasks: RetryTask[];
}

// Map timeframe status from task_info to ScrapingStatus format
function mapTimeframeStatus(status: string): 'pending' | 'downloading' | 'success' | 'failed' {
  switch (status) {
    case 'pending': return 'pending';
    case 'downloading': return 'downloading';
    case 'success': return 'success';
    case 'failed': return 'failed';
    default: return 'pending';
  }
}

// Convert task_info.json format to ScrapingStatus
function convertTaskInfoToStatus(taskInfo: TaskInfoJob): ScrapingStatus {
  // Map status from task_info to JobStatus
  const statusMap: Record<string, JobStatus> = {
    'idle': 'idle',
    'running': 'running',
    'completed': 'completed',
    'partial': 'partial',
    'stopped': 'idle',
    'error': 'error',
  };

  const status = statusMap[taskInfo.status] || 'idle';

  // Build symbols array
  const symbols: SymbolScrapingStatus[] = SYMBOLS.map(symbol => {
    const taskSymbol = taskInfo.symbols[symbol];

    if (!taskSymbol) {
      return {
        symbol,
        status: 'pending' as const,
        timeframes: {
          '12달': { status: 'pending' as const },
          '1달': { status: 'pending' as const },
          '1주': { status: 'pending' as const },
          '1일': { status: 'pending' as const },
        },
      };
    }

    // Map symbol status
    let symbolStatus: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed' = 'pending';
    switch (taskSymbol.status) {
      case 'pending': symbolStatus = 'pending'; break;
      case 'downloading': symbolStatus = 'in_progress'; break;
      case 'uploading': symbolStatus = 'in_progress'; break;
      case 'completed': symbolStatus = 'completed'; break;
      case 'partial': symbolStatus = 'partial'; break;
      case 'failed': symbolStatus = 'failed'; break;
    }

    // Map each timeframe status from task_info
    const timeframes = taskSymbol.timeframes || {};
    const tf12 = timeframes['12달'] || { status: 'pending', rows: 0 };
    const tf1m = timeframes['1달'] || { status: 'pending', rows: 0 };
    const tf1w = timeframes['1주'] || { status: 'pending', rows: 0 };
    const tf1d = timeframes['1일'] || { status: 'pending', rows: 0 };

    // Calculate total rows from all timeframes
    const totalRows = (tf12.rows || 0) + (tf1m.rows || 0) + (tf1w.rows || 0) + (tf1d.rows || 0);

    return {
      symbol,
      status: symbolStatus,
      startedAt: taskSymbol.start_time,
      completedAt: taskSymbol.end_time,
      timeframes: {
        '12달': {
          status: mapTimeframeStatus(tf12.status),
          rows: tf12.rows || undefined,
          error: tf12.error,
        },
        '1달': {
          status: mapTimeframeStatus(tf1m.status),
          rows: tf1m.rows || undefined,
          error: tf1m.error,
        },
        '1주': {
          status: mapTimeframeStatus(tf1w.status),
          rows: tf1w.rows || undefined,
          error: tf1w.error,
        },
        '1일': {
          status: mapTimeframeStatus(tf1d.status),
          rows: tf1d.rows || undefined,
          error: tf1d.error,
        },
      },
    };
  });

  // Calculate progress
  const completedCount = Object.values(taskInfo.symbols).filter(s => s.status === 'completed').length;
  const totalSymbols = Object.keys(taskInfo.symbols).length || SYMBOLS.length;

  // Collect errors from all timeframes
  const errors: ScrapingError[] = [];
  for (const sym of Object.values(taskInfo.symbols)) {
    if (sym.timeframes) {
      for (const [tfName, tf] of Object.entries(sym.timeframes)) {
        if (tf.error) {
          errors.push({
            timestamp: sym.end_time || new Date().toISOString(),
            symbol: sym.symbol,
            timeframe: tfName as any,
            type: 'download' as const,
            message: tf.error,
          });
        }
      }
    }
  }

  return {
    status,
    lastRun: taskInfo.end_time || taskInfo.start_time || null,
    currentSession: taskInfo.start_time ? {
      startTime: taskInfo.start_time,
      headlessMode: true,
      dbUploadEnabled: true,
      sshTunnelActive: true,
    } : null,
    progress: {
      totalSymbols: totalSymbols,
      completedSymbols: completedCount,
      currentSymbol: taskInfo.current_symbol || null,
      currentTimeframe: (taskInfo.current_timeframe as '12달' | '1달' | '1주' | '1일') || null,
      percentage: totalSymbols > 0 ? Math.round((completedCount / totalSymbols) * 100) : 0,
    },
    statistics: {
      totalDownloads: taskInfo.total_downloaded,
      successfulUploads: taskInfo.total_uploaded,
      failedDownloads: Object.values(taskInfo.symbols).filter(s => s.status === 'failed' || s.status === 'partial').length,
      totalRowsUploaded: taskInfo.total_rows,
    },
    symbols,
    errors: errors.slice(-50), // Keep last 50 errors
  };
}

// Generate dummy scraping data for local development
function generateDummyScrapingStatus(): ScrapingStatus {
  const symbols: SymbolScrapingStatus[] = SYMBOLS.map((symbol, idx) => {
    // Mix of statuses for realistic demo
    let status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';
    if (idx < 78) status = 'completed';
    else if (idx < 82) status = 'partial';
    else if (idx < 85) status = 'failed';
    else if (idx < 90) status = 'in_progress';
    else status = 'pending';

    const tfStatuses: Array<'pending' | 'downloading' | 'success' | 'failed'> =
      status === 'completed' ? ['success','success','success','success'] :
      status === 'partial' ? ['success','success','failed','pending'] :
      status === 'failed' ? ['failed','pending','pending','pending'] :
      status === 'in_progress' ? ['success','downloading','pending','pending'] :
      ['pending','pending','pending','pending'];

    return {
      symbol,
      status,
      startedAt: status !== 'pending' ? new Date(Date.now() - (101-idx)*60000).toISOString() : undefined,
      completedAt: status === 'completed' ? new Date(Date.now() - (101-idx)*30000).toISOString() : undefined,
      timeframes: {
        '12달': { status: tfStatuses[0], rows: tfStatuses[0]==='success' ? Math.floor(Math.random()*300)+200 : undefined },
        '1달': { status: tfStatuses[1], rows: tfStatuses[1]==='success' ? Math.floor(Math.random()*500)+400 : undefined },
        '1주': { status: tfStatuses[2], rows: tfStatuses[2]==='success' ? Math.floor(Math.random()*800)+500 : undefined, error: tfStatuses[2]==='failed' ? 'Download timeout after 30s' : undefined },
        '1일': { status: tfStatuses[3], rows: tfStatuses[3]==='success' ? Math.floor(Math.random()*1200)+800 : undefined },
      },
    };
  });

  return {
    status: 'running',
    lastRun: new Date().toISOString(),
    currentSession: {
      startTime: new Date(Date.now() - 3600000).toISOString(),
      headlessMode: true,
      dbUploadEnabled: true,
      sshTunnelActive: true,
    },
    progress: {
      totalSymbols: 101,
      completedSymbols: 78,
      currentSymbol: 'PLTR',
      currentTimeframe: '1달',
      percentage: 77,
    },
    statistics: {
      totalDownloads: 340,
      successfulUploads: 328,
      failedDownloads: 5,
      totalRowsUploaded: 487230,
    },
    symbols,
    errors: [
      { timestamp: new Date(Date.now()-120000).toISOString(), symbol: 'TSLA', timeframe: '1주', type: 'timeout', message: 'Connection timeout after 30s' },
      { timestamp: new Date(Date.now()-300000).toISOString(), symbol: 'META', timeframe: '12달', type: 'download', message: 'Failed to download CSV file' },
      { timestamp: new Date(Date.now()-600000).toISOString(), symbol: 'BA', timeframe: '1일', type: 'upload', message: 'DB connection refused' },
    ],
    totalDuration: 3547,
  };
}

export async function GET() {
  try {
    // Try to read task_info.json first (new scraper-service format)
    try {
      const taskInfoContent = await fs.readFile(TASK_INFO_PATH, 'utf-8');
      const taskInfo: TaskInfoJob = JSON.parse(taskInfoContent);

      // If task_info.json exists and has valid data, use it
      if (taskInfo && taskInfo.job_id && taskInfo.job_id !== 'initial') {
        const status = convertTaskInfoToStatus(taskInfo);
        return NextResponse.json(status);
      }
    } catch (taskInfoError) {
      // task_info.json not found or invalid, fall through to log parsing
      console.log('task_info.json not available, falling back to log parsing or dummy data');
    }

    // Try log parsing, if that also fails or returns idle use dummy data
    try {
      const status = await parseScrapingLog();
      // If log parsing returns meaningful data, use it
      if (status && status.status !== 'idle' && status.symbols && status.symbols.length > 0 && status.symbols.some((s: SymbolScrapingStatus) => s.status !== 'pending')) {
        return NextResponse.json(status);
      }
      throw new Error('No meaningful data from log parser');
    } catch (logError) {
      console.log('Using dummy data for local development');
      const dummyStatus = generateDummyScrapingStatus();
      return NextResponse.json(dummyStatus);
    }
  } catch (error) {
    console.error('Error fetching scraping status:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastRun: null,
        currentSession: null,
        progress: {
          totalSymbols: 101,
          completedSymbols: 0,
          currentSymbol: null,
          currentTimeframe: null,
          percentage: 0,
        },
        statistics: {
          totalDownloads: 0,
          successfulUploads: 0,
          failedDownloads: 0,
          totalRowsUploaded: 0,
        },
        symbols: [],
        errors: [],
      },
      { status: 500 }
    );
  }
}

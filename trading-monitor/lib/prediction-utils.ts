import type { OHLCVDataPoint } from './chart-types';

export interface TimeValuePoint {
  time: string;
  value: number;
}

export interface ConfidenceCone {
  center: TimeValuePoint[];
  upper80: TimeValuePoint[];
  lower80: TimeValuePoint[];
  upper50: TimeValuePoint[];
  lower50: TimeValuePoint[];
}

export interface MonteCarloPath {
  id: number;
  points: TimeValuePoint[];
}

export interface HistoricalPatternCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface HistoricalPattern {
  similarity: number;
  startIdx: number;
  path: TimeValuePoint[];
  candles: HistoricalPatternCandle[];
  lineColor: string;
  candleUpColor: string;
  candleDownColor: string;
  wickColor: string;
}

export type PredictionMode = 'off' | 'pred';

export interface PredictionOverlayData {
  historical?: HistoricalPattern[];
}

// === Pattern Color Configs ===
const PATTERN_COLORS = [
  { line: 'rgba(59, 130, 246, 0.7)', up: 'rgba(59, 130, 246, 0.4)', down: 'rgba(59, 130, 246, 0.25)', wick: 'rgba(59, 130, 246, 0.35)' },
  { line: 'rgba(168, 85, 247, 0.7)', up: 'rgba(168, 85, 247, 0.4)', down: 'rgba(168, 85, 247, 0.25)', wick: 'rgba(168, 85, 247, 0.35)' },
  { line: 'rgba(234, 179, 8, 0.7)', up: 'rgba(234, 179, 8, 0.4)', down: 'rgba(234, 179, 8, 0.25)', wick: 'rgba(234, 179, 8, 0.35)' },
  { line: 'rgba(236, 72, 153, 0.7)', up: 'rgba(236, 72, 153, 0.4)', down: 'rgba(236, 72, 153, 0.25)', wick: 'rgba(236, 72, 153, 0.35)' },
  { line: 'rgba(20, 184, 166, 0.7)', up: 'rgba(20, 184, 166, 0.4)', down: 'rgba(20, 184, 166, 0.25)', wick: 'rgba(20, 184, 166, 0.35)' },
];

// === Helper Functions ===

function addBusinessDays(startDate: Date, days: number): Date[] {
  const dates: Date[] = [];
  const d = new Date(startDate);
  d.setDate(d.getDate() + 1);
  let count = 0;
  while (count < days) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(new Date(d));
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function normalRandom(rng: () => number): number {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// === Core Calculations ===

export function calculateDailyVolatility(data: OHLCVDataPoint[]): number {
  if (data.length < 10) return 0.25;
  const closes = data.map((d) => d.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (returns.length < 5) return 0.25;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);
  return dailyVol * Math.sqrt(252);
}

/**
 * 예측1-A: Confidence Cone
 * Center line: lastPrice → targetPrice (상한가 +30%)
 * Bands: ±0.67σ√t (50%), ±1.28σ√t (80%)
 */
export function generateConfidenceCone(
  lastPrice: number,
  targetPrice: number,
  days: number,
  annualizedVol: number,
  lastDate: string
): ConfidenceCone {
  const dailyVol = annualizedVol / Math.sqrt(252);
  const startDate = new Date(lastDate);
  const futureDates = addBusinessDays(startDate, days);

  const totalReturn = Math.log(targetPrice / lastPrice);
  const dailyDrift = totalReturn / days;

  const center: TimeValuePoint[] = [{ time: lastDate, value: lastPrice }];
  const upper80: TimeValuePoint[] = [{ time: lastDate, value: lastPrice }];
  const lower80: TimeValuePoint[] = [{ time: lastDate, value: lastPrice }];
  const upper50: TimeValuePoint[] = [{ time: lastDate, value: lastPrice }];
  const lower50: TimeValuePoint[] = [{ time: lastDate, value: lastPrice }];

  for (let i = 0; i < futureDates.length; i++) {
    const t = i + 1;
    const time = formatDate(futureDates[i]);
    const centerVal = lastPrice * Math.exp(dailyDrift * t);
    const sigma = lastPrice * dailyVol * Math.sqrt(t);

    center.push({ time, value: centerVal });
    upper80.push({ time, value: centerVal + 1.28 * sigma });
    lower80.push({ time, value: Math.max(centerVal - 1.28 * sigma, lastPrice * 0.5) });
    upper50.push({ time, value: centerVal + 0.67 * sigma });
    lower50.push({ time, value: Math.max(centerVal - 0.67 * sigma, lastPrice * 0.5) });
  }

  return { center, upper80, lower80, upper50, lower50 };
}

/**
 * 예측1-B: Monte Carlo (GBM)
 * Drift targets the targetPrice (+30% 상한가)
 */
export function generateMonteCarloPaths(
  lastPrice: number,
  targetPrice: number,
  days: number,
  annualizedVol: number,
  lastDate: string,
  numPaths: number = 15,
  seed: number = 42
): MonteCarloPath[] {
  const dailyVol = annualizedVol / Math.sqrt(252);
  // Drift toward target price (not risk-neutral)
  const totalReturn = Math.log(targetPrice / lastPrice);
  const dailyDrift = totalReturn / days;
  const startDate = new Date(lastDate);
  const futureDates = addBusinessDays(startDate, days);
  const paths: MonteCarloPath[] = [];

  for (let p = 0; p < numPaths; p++) {
    const rng = seededRandom(seed + p * 137);
    const points: TimeValuePoint[] = [{ time: lastDate, value: lastPrice }];
    let price = lastPrice;

    for (let i = 0; i < futureDates.length; i++) {
      const z = normalRandom(rng);
      price = price * Math.exp(dailyDrift + dailyVol * z);
      points.push({ time: formatDate(futureDates[i]), value: price });
    }
    paths.push({ id: p, points });
  }

  return paths;
}

/**
 * 예측2: Historical Analogy
 * Pearson correlation on normalized rolling windows.
 * Returns both close-price path AND scaled OHLCV candles.
 */
export function findSimilarPatterns(
  data: OHLCVDataPoint[],
  windowSize: number = 15,
  projectionDays: number = 63,
  topN: number = 5
): HistoricalPattern[] {
  if (data.length < windowSize + projectionDays + 5) return [];

  const closes = data.map((d) => d.close);

  // Current window = last `windowSize` data points
  const currentWindow = closes.slice(-windowSize);
  const currentNorm = normalize(currentWindow);

  const candidates: { similarity: number; startIdx: number }[] = [];

  // Slide through historical data
  const maxStart = closes.length - windowSize - projectionDays;
  for (let i = 0; i < maxStart; i++) {
    const historicalWindow = closes.slice(i, i + windowSize);
    const histNorm = normalize(historicalWindow);
    const corr = pearsonCorrelation(currentNorm, histNorm);

    if (corr > 0.5) {
      candidates.push({ similarity: corr, startIdx: i });
    }
  }

  // Sort by similarity descending
  candidates.sort((a, b) => b.similarity - a.similarity);

  // Remove overlapping windows (at least 10 bars apart)
  const selected: typeof candidates = [];
  for (const c of candidates) {
    if (selected.every((s) => Math.abs(s.startIdx - c.startIdx) >= 10)) {
      selected.push(c);
      if (selected.length >= topN) break;
    }
  }

  // Build projection paths with OHLCV candles
  const lastDate = String(data[data.length - 1].time);
  const startDate = new Date(lastDate);
  const futureDates = addBusinessDays(startDate, projectionDays);
  const lastClose = closes[closes.length - 1];

  return selected.map((s, idx) => {
    const matchEndIdx = s.startIdx + windowSize;
    const matchEndPrice = closes[matchEndIdx - 1];
    const scaleRatio = lastClose / matchEndPrice;

    const projectionSlice = data.slice(matchEndIdx, matchEndIdx + projectionDays);
    const colorConfig = PATTERN_COLORS[idx % PATTERN_COLORS.length];

    const path: TimeValuePoint[] = [{ time: lastDate, value: lastClose }];
    const candles: HistoricalPatternCandle[] = [];

    for (let i = 0; i < Math.min(projectionSlice.length, futureDates.length); i++) {
      const d = projectionSlice[i];
      const time = formatDate(futureDates[i]);

      path.push({ time, value: d.close * scaleRatio });
      candles.push({
        time,
        open: d.open * scaleRatio,
        high: d.high * scaleRatio,
        low: d.low * scaleRatio,
        close: d.close * scaleRatio,
      });
    }

    return {
      similarity: Math.round(s.similarity * 100) / 100,
      startIdx: s.startIdx,
      path,
      candles,
      lineColor: colorConfig.line,
      candleUpColor: colorConfig.up,
      candleDownColor: colorConfig.down,
      wickColor: colorConfig.wick,
    };
  });
}

// === Math Utilities ===

function normalize(arr: number[]): number[] {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  return arr.map((v) => (v - min) / range);
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

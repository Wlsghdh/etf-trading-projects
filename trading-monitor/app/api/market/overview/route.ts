import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FRED_API_KEY = '9caba366c8bc71e8fea23b45a34651a5';

interface MarketOverview {
  exchangeRate: { usdKrw: number; change: number } | null;
  vix: { value: number; change: number; label: string } | null;
  gold: { price: number; change: number } | null;
  bitcoin: { price: number; change: number } | null;
  crudeOil: { price: number; change: number } | null;
  dollarIndex: { price: number; change: number } | null;
  rates: {
    fedRate: number | null;
    treasury10y: number | null;
  };
  indices: {
    sp500: { value: number; change: number } | null;
    nasdaq: { value: number; change: number } | null;
    dow: { value: number; change: number } | null;
  };
  updatedAt: string;
}

async function fetchJSON(url: string, timeout = 8000): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function fetchFredLatest(seriesId: string): Promise<number | null> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
    const data = (await fetchJSON(url)) as { observations: { value: string }[] };
    const val = parseFloat(data.observations?.[0]?.value);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

async function fetchExchangeRate(): Promise<{ usdKrw: number; change: number } | null> {
  try {
    const data = (await fetchJSON('https://open.er-api.com/v6/latest/USD')) as {
      rates: Record<string, number>;
    };
    return { usdKrw: data.rates?.KRW ?? 0, change: 0 };
  } catch {
    return null;
  }
}

async function fetchYahooQuote(
  symbol: string
): Promise<{ price: number; change: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const data = (await fetchJSON(url)) as {
      chart: {
        result: {
          meta: { regularMarketPrice: number; previousClose: number };
        }[];
      };
    };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose || price;
    return { price, change: ((price - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

function vixLabel(v: number): string {
  if (v < 12) return 'Extreme Greed';
  if (v < 20) return 'Low Fear';
  if (v < 30) return 'Moderate Fear';
  if (v < 40) return 'High Fear';
  return 'Extreme Fear';
}

export async function GET() {
  const [exchangeRate, vixQuote, goldQuote, sp500, nasdaq, dow, fedRate, treasury10y, btcQuote, oilQuote, dxyQuote] =
    await Promise.allSettled([
      fetchExchangeRate(),
      fetchYahooQuote('^VIX'),
      fetchYahooQuote('GC=F'),
      fetchYahooQuote('^GSPC'),
      fetchYahooQuote('^IXIC'),
      fetchYahooQuote('^DJI'),
      fetchFredLatest('FEDFUNDS'),
      fetchFredLatest('DGS10'),
      fetchYahooQuote('BTC-USD'),
      fetchYahooQuote('CL=F'),
      fetchYahooQuote('DX-Y.NYB'),
    ]);

  const v = (r: PromiseSettledResult<unknown>) =>
    r.status === 'fulfilled' ? r.value : null;

  const vixData = v(vixQuote) as { price: number; change: number } | null;

  const btcData = v(btcQuote) as { price: number; change: number } | null;
  const oilData = v(oilQuote) as { price: number; change: number } | null;
  const dxyData = v(dxyQuote) as { price: number; change: number } | null;

  const overview: MarketOverview = {
    exchangeRate: v(exchangeRate) as MarketOverview['exchangeRate'],
    vix: vixData
      ? { value: vixData.price, change: vixData.change, label: vixLabel(vixData.price) }
      : null,
    gold: v(goldQuote) as MarketOverview['gold'],
    bitcoin: btcData ? { price: btcData.price, change: btcData.change } : null,
    crudeOil: oilData ? { price: oilData.price, change: oilData.change } : null,
    dollarIndex: dxyData ? { price: dxyData.price, change: dxyData.change } : null,
    rates: {
      fedRate: v(fedRate) as number | null,
      treasury10y: v(treasury10y) as number | null,
    },
    indices: {
      sp500: v(sp500) as MarketOverview['indices']['sp500'],
      nasdaq: v(nasdaq) as MarketOverview['indices']['nasdaq'],
      dow: v(dow) as MarketOverview['indices']['dow'],
    },
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(overview);
}

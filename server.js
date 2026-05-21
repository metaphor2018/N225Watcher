import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ヘルパー関数: Yahoo Finance APIからデータを取得 (クッキーやcrumbなしで叩けるエンドポイント)
async function fetchYahooData(symbol, range = '1mo', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance API returned status ${response.status}`);
  }

  return await response.json();
}

// 最新価格情報API
app.get('/api/quote', async (req, res) => {
  try {
    // 直近1日の1分足データを取得して、最新価格や当日の四本値を計算する
    const data = await fetchYahooData('^N225', '1d', '1m');
    const result = data.chart.result?.[0];
    
    if (!result) {
      throw new Error('No data found in Yahoo Finance response');
    }

    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    
    // 基本パラメータの抽出
    let price = meta.regularMarketPrice;
    let previousClose = meta.previousClose || meta.chartPreviousClose;
    let open = previousClose;
    let high = price;
    let low = price;

    // もし1分足データが存在すれば、より正確な今日の四本値を算出する
    if (quotes && quotes.open && quotes.open.length > 0) {
      const validOpens = quotes.open.filter(v => v !== null && v !== undefined);
      const validHighs = quotes.high.filter(v => v !== null && v !== undefined);
      const validLows = quotes.low.filter(v => v !== null && v !== undefined);
      const validCloses = quotes.close.filter(v => v !== null && v !== undefined);

      if (validOpens.length > 0) open = validOpens[0];
      if (validHighs.length > 0) high = Math.max(...validHighs);
      if (validLows.length > 0) low = Math.min(...validLows);
      if (validCloses.length > 0) price = validCloses[validCloses.length - 1];
    }

    // 各値の安全なフォールバック
    if (!price) price = meta.regularMarketPrice;
    if (!previousClose) previousClose = price;
    
    // 前日比と騰落率の計算
    const change = price - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    res.json({
      symbol: meta.symbol,
      price: price,
      change: change,
      changePercent: changePercent,
      previousClose: previousClose,
      open: open || price,
      high: Math.max(high || price, price),
      low: Math.min(low || price, price),
      time: (meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000, // ミリ秒変換
      currency: meta.currency || 'JPY'
    });
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Failed to fetch stock quote data', details: error.message });
  }
});

// 履歴データAPI
app.get('/api/historical', async (req, res) => {
  const period = req.query.period || '1m';
  let range = '1mo';
  let interval = '1d';

  switch (period) {
    case '7d':
      range = '7d';
      interval = '1d';
      break;
    case '1m':
      range = '1mo';
      interval = '1d';
      break;
    case '3m':
      range = '3mo';
      interval = '1d';
      break;
    case '1y':
      range = '1y';
      interval = '1d';
      break;
    default:
      range = '1mo';
      interval = '1d';
  }

  try {
    const data = await fetchYahooData('^N225', range, interval);
    const result = data.chart.result?.[0];
    
    if (!result) {
      throw new Error('No data found in Yahoo Finance response');
    }

    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0] || {};
    const closes = quotes.close || [];
    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const volumes = quotes.volume || [];

    // 各日付のデータを整形
    const historicalData = timestamps.map((timestamp, index) => {
      const date = new Date(timestamp * 1000);
      // YYYY-MM-DD 形式にフォーマット
      const dateString = date.toISOString().split('T')[0];

      return {
        date: dateString,
        open: opens[index],
        high: highs[index],
        low: lows[index],
        close: closes[index],
        volume: volumes[index]
      };
    }).filter(item => item.close !== null && item.close !== undefined); // 無効な値を除外

    res.json(historicalData);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical stock data', details: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

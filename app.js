// グローバル変数
let chartInstance = null;
let currentPeriod = '1m';

// Lucideアイコンの初期化
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initApp();
});

// アプリの初期化
function initApp() {
  // イベントリスナーの登録
  document.getElementById('refresh-btn').addEventListener('click', handleManualRefresh);
  
  const periodButtons = document.querySelectorAll('.period-btn');
  periodButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const period = e.target.getAttribute('data-period');
      if (period !== currentPeriod) {
        // アクティブクラスの切り替え
        periodButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        currentPeriod = period;
        loadChartData(currentPeriod);
      }
    });
  });

  // 初回データロード
  loadQuoteData();
  loadChartData(currentPeriod);

  // 定期更新 (1分ごと)
  setInterval(loadQuoteData, 60000);
}

// 手動更新時の処理
async function handleManualRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  
  await Promise.all([
    loadQuoteData(),
    loadChartData(currentPeriod)
  ]);
  
  // スピナー風の回転を表現するための遅延
  setTimeout(() => {
    btn.classList.remove('spinning');
  }, 600);
}

// 数値のフォーマット (例: 38500.50 -> 38,500.50)
function formatCurrency(value) {
  if (value === null || value === undefined) return '--';
  return new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// パーセントのフォーマット (例: 1.25 -> +1.25%)
function formatPercent(value) {
  if (value === null || value === undefined) return '--';
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

// 最新データの読み込み (CORSプロキシ経由で直接Yahoo Financeをフェッチ)
async function loadQuoteData() {
  const priceLoading = document.getElementById('price-loading');
  const priceContainer = document.getElementById('price-container');
  const changeContainer = document.getElementById('change-container');
  const priceEl = document.getElementById('current-price');
  const priceChangeEl = document.getElementById('price-change');
  const priceChangePercentEl = document.getElementById('price-change-percent');
  const updateTimeEl = document.getElementById('update-time');
  
  const valOpen = document.getElementById('val-open');
  const valPrevClose = document.getElementById('val-prev-close');
  const valHigh = document.getElementById('val-high');
  const valLow = document.getElementById('val-low');
  
  const priceCard = document.querySelector('.price-card');
  const changeBadge = document.getElementById('change-badge');
  const changeIcon = document.getElementById('change-icon');

  try {
    const symbol = '^N225';
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    const result = data.chart.result?.[0];
    if (!result) throw new Error('No data found in Yahoo Finance response');

    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    
    // 基本パラメータの抽出
    let price = meta.regularMarketPrice;
    let previousClose = meta.previousClose || meta.chartPreviousClose;
    let open = previousClose;
    let high = price;
    let low = price;

    // 当日の1分足データがあればそこから正確な高値・安値を計算
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

    if (!price) price = meta.regularMarketPrice;
    if (!previousClose) previousClose = price;
    
    const change = price - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    // UI表示用のデータまとめ
    const normalizedData = {
      price: price,
      change: change,
      changePercent: changePercent,
      previousClose: previousClose,
      open: open || price,
      high: Math.max(high || price, price),
      low: Math.min(low || price, price),
      time: (meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000
    };
    
    // スケルトンの非表示、データコンテナの表示
    priceLoading.classList.add('hide');
    priceContainer.classList.remove('hide');
    changeContainer.classList.remove('hide');
    
    // 数値の表示更新
    priceEl.textContent = formatCurrency(normalizedData.price);
    
    const isUp = normalizedData.change >= 0;
    
    // トレンドによるクラス追加
    if (isUp) {
      priceCard.className = 'glass-card price-card trend-up';
      changeBadge.style.color = 'var(--color-up)';
      changeBadge.style.backgroundColor = 'var(--color-up-bg)';
      changeIcon.setAttribute('data-lucide', 'arrow-up');
    } else {
      priceCard.className = 'glass-card price-card trend-down';
      changeBadge.style.color = 'var(--color-down)';
      changeBadge.style.backgroundColor = 'var(--color-down-bg)';
      changeIcon.setAttribute('data-lucide', 'arrow-down');
    }
    
    // アイコンの再描画
    lucide.createIcons();
    
    priceChangeEl.textContent = (isUp ? '+' : '') + formatCurrency(normalizedData.change);
    priceChangePercentEl.textContent = `(${formatPercent(normalizedData.changePercent)})`;
    
    // 市場詳細の更新
    valOpen.textContent = formatCurrency(normalizedData.open);
    valPrevClose.textContent = formatCurrency(normalizedData.previousClose);
    valHigh.textContent = formatCurrency(normalizedData.high);
    valLow.textContent = formatCurrency(normalizedData.low);
    
    // 更新日時の設定
    const updateTime = new Date(normalizedData.time);
    updateTimeEl.textContent = `更新日時: ${updateTime.toLocaleString('ja-JP')}`;
    
    // 市場ステータスドットの変更 (取引時間内かどうかの概算)
    updateMarketStatus(updateTime);
    
  } catch (error) {
    console.error('Error loading quote data:', error);
    priceLoading.innerHTML = '<span style="color: var(--color-down); font-size: 0.9rem;">データの取得に失敗しました</span>';
  }
}

// チャートデータの読み込み (CORSプロキシ経由で直接Yahoo Financeをフェッチ)
async function loadChartData(period) {
  const chartLoading = document.getElementById('chart-loading');
  chartLoading.classList.add('active');
  
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
  }

  try {
    const symbol = '^N225';
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    const result = data.chart.result?.[0];
    if (!result) throw new Error('No data found in Yahoo Finance response');

    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0] || {};
    const closes = quotes.close || [];
    const opens = quotes.open || [];
    const highs = quotes.high || [];
    const lows = quotes.low || [];
    const volumes = quotes.volume || [];

    // データの整形
    const historicalData = timestamps.map((timestamp, index) => {
      const date = new Date(timestamp * 1000);
      const dateString = date.toISOString().split('T')[0];

      return {
        date: dateString,
        open: opens[index],
        high: highs[index],
        low: lows[index],
        close: closes[index],
        volume: volumes[index]
      };
    }).filter(item => item.close !== null && item.close !== undefined);
    
    // チャートの描画
    renderChart(historicalData);
    
  } catch (error) {
    console.error('Error loading chart data:', error);
    const container = document.querySelector('.chart-container');
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:var(--color-down);">チャートデータの取得に失敗しました</div>';
  } finally {
    chartLoading.classList.remove('active');
  }
}

// Chart.jsによるチャート描画
function renderChart(data) {
  const ctx = document.getElementById('n225Chart').getContext('2d');
  
  // 日付と終値の配列を作成
  const labels = data.map(item => {
    const date = new Date(item.date);
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  });
  const prices = data.map(item => item.close);
  
  // トレンド色の決定（期間内での上昇・下落）
  const isOverallUp = prices[prices.length - 1] >= prices[0];
  const themeColor = isOverallUp ? '#10b981' : '#f43f5e'; // Emerald or Rose
  const themeColorLight = isOverallUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
  
  // グラデーションの作成
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, themeColorLight);
  gradient.addColorStop(1, 'rgba(15, 22, 38, 0)');

  // 既存のチャートがあれば破棄
  if (chartInstance) {
    chartInstance.destroy();
  }

  // チャート設定
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '日経平均株価 (終値)',
        data: prices,
        borderColor: themeColor,
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        tension: 0.3, // 滑らかな曲線
        pointBackgroundColor: themeColor,
        pointBorderColor: 'rgba(255,255,255,0.8)',
        pointBorderWidth: 0,
        pointRadius: 0, // 通常時は非表示
        pointHoverRadius: 6, // ホバー時のみ表示
        pointHoverBackgroundColor: themeColor,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // 凡例は非表示
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          titleFont: {
            family: 'Outfit',
            size: 13,
            weight: 'bold'
          },
          bodyColor: '#e2e8f0',
          bodyFont: {
            family: 'Outfit',
            size: 14
          },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return `終値: ${formatCurrency(context.parsed.y)} JPY`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false // X軸のグリッド線を非表示
          },
          ticks: {
            color: '#64748b',
            font: {
              family: 'Outfit',
              size: 10
            },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          },
          border: {
            display: false
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)' // Y軸のグリッド線を非常に薄く
          },
          ticks: {
            color: '#64748b',
            font: {
              family: 'Outfit',
              size: 10
            },
            callback: function(value) {
              return value.toLocaleString('ja-JP');
            }
          },
          border: {
            display: false
          }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    }
  });
}

// 市場ステータスの更新
function updateMarketStatus(lastUpdateTime) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  const now = new Date();
  const day = now.getDay(); // 0: 日, 6: 土
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 土日の場合
  if (day === 0 || day === 6) {
    statusDot.className = 'status-dot closed';
    statusText.textContent = '市場休業 (土日)';
    return;
  }

  // 平日の取引時間：前場 (9:00 - 11:30), 後場 (12:30 - 15:00)
  const isMorningSession = (hour === 9 && minute >= 0) || (hour === 10) || (hour === 11 && minute <= 30);
  const isAfternoonSession = (hour === 12 && minute >= 30) || (hour === 13) || (hour === 14) || (hour === 15 && minute === 0);

  if (isMorningSession || isAfternoonSession) {
    statusDot.className = 'status-dot live';
    statusText.textContent = '市場取引中 (リアルタイム)';
  } else {
    statusDot.className = 'status-dot closed';
    if (hour < 9) {
      statusText.textContent = '取引開始前';
    } else {
      statusText.textContent = '取引終了 (大引け)';
    }
  }
}

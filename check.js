const fs = require('fs');

// 要監控的分類頁（官網英文版）。想加分類就把 // 拿掉。
const CATALOGS = [
  'https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/principal',   // 主要抹茶：天授、長安、青嵐、和光、又玄…
  // 'https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/tea-schools', // 茶道家元好み
  // 'https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/kancho',      // 寺院好み
  // 'https://www.marukyu-koyamaen.co.jp/english/shop/products/catalog/matcha/gentei',      // 限定
];

// 只想盯特定品項就填英文名（例如 ['Wako', 'Yugen']）；留空 = 全部都通知
const ONLY = [];

const STATE_FILE = 'state.json';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
};

async function main() {
  if (!process.env.LINE_TOKEN) throw new Error('找不到 LINE_TOKEN，請到 Settings → Secrets 新增');

  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
  const firstRun = !state.items;
  state.items = state.items || {};

  const restocked = [];
  const nowInStock = [];
  let found = 0;

  for (const url of CATALOGS) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`抓取失敗 ${res.status}：${url}`);
      continue;
    }
    const html = await res.text();
    const re = /<li class="product [^"]*\b(instock|outofstock)\b[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const [, status, link, name] = m;
      if (ONLY.length && !ONLY.includes(name)) continue;
      found++;
      const inStock = status === 'instock';
      const was = state.items[link] === true;
      if (inStock) nowInStock.push(`${name}\n${link}`);
      if (inStock && !was && !firstRun) restocked.push(`${name}\n${link}`);
      state.items[link] = inStock;
    }
  }

  if (found === 0) {
    console.error('一個商品都沒抓到：官網可能擋了這台伺服器，或網頁改版了。');
    process.exit(1);
  }

  if (firstRun) {
    await broadcast('🍵 開始監控丸久小山園補貨\n目前有貨：\n\n' + (nowInStock.join('\n\n') || '（全部缺貨）'));
  } else if (restocked.length) {
    await broadcast('🍵 丸久小山園補貨了！\n\n' + restocked.join('\n\n'));
  }

  state.lastCheck = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  console.log(`檢查 ${found} 項，有貨 ${nowInStock.length} 項，新補貨 ${restocked.length} 項`);
}

async function broadcast(text) {
  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.LINE_TOKEN,
    },
    body: JSON.stringify({ messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  });
  if (!res.ok) {
    console.error('LINE 發送失敗：' + (await res.text()));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

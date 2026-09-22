/* Hi!story 代理カードメモ ジェネレーター
 * 検索 → 選択キュー → canvas描画 → jsPDFでA4シート生成
 * データ読み込み・検索・参照関係マップは common.js を参照
 */

// ---- レイアウト定数（カード描画） ----
const SCALE = 10; // px per mm
const CARD_W_MM = 63;
const CARD_H_MM = 88;
const CANVAS_W = CARD_W_MM * SCALE; // 630
const CANVAS_H = CARD_H_MM * SCALE; // 880
const MARGIN = Math.round(CANVAS_W * 0.046);

// ---- A4シートレイアウト定数 ----
const GAP_MM = 3;
const COLS = 3;
const ROWS = 3;
const SHRINK_X_MM = 2; // 左右2mmずつ縮小
const SHRINK_Y_MM = 4; // 上下4mmずつ縮小（2mm+追加2mm）
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

let queue = []; // { card, qty }

// ---------- テキスト折り返し（CJK：文字単位） ----------
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let cur = "";
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width <= maxWidth || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const paragraphs = String(text).replace(/\r\n/g, "\n").split("\n");
  let curY = y;
  for (const para of paragraphs) {
    const lines = para.length ? wrapText(ctx, para, maxWidth) : [""];
    for (const line of lines) {
      ctx.fillText(line, x, curY);
      curY += lineHeight;
    }
  }
  return curY;
}

// ---------- 1枚のカードをcanvasに描画 ----------
function drawCard(canvas, card) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 外枠
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);

  let y = MARGIN + 20;
  const fSmall = Math.round(CANVAS_W * 0.035);
  const fName = Math.round(CANVAS_W * 0.07);
  const fAttr = Math.round(CANVAS_W * 0.03);
  const fAlias = Math.round(CANVAS_W * 0.032);
  const fEffName = Math.round(CANVAS_W * 0.04);
  const fEffMark = Math.round(CANVAS_W * 0.027);
  const fEffBody = Math.round(CANVAS_W * 0.034);
  const fFlavor = Math.round(CANVAS_W * 0.027);
  const fFoot = Math.round(CANVAS_W * 0.021);
  const FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

  // ランクバッジ
  ctx.font = `bold ${fSmall}px ${FONT}`;
  ctx.textBaseline = "top";
  const rankTxt = `ランク${card.rank ?? ""}`;
  const badgeW = Math.round(CANVAS_W * 0.28);
  const badgeH = Math.round(fSmall * 1.7);
  roundRect(ctx, MARGIN, y, badgeW, badgeH, 8);
  ctx.fillStyle = "#000";
  ctx.fillText(rankTxt, MARGIN + 12, y + badgeH * 0.18);

  // 攻/防 + パワー
  const adpTxt = `${card.attackDefense ?? ""} / ${card.power ?? ""}`;
  const adpW = ctx.measureText(adpTxt).width;
  ctx.fillText(adpTxt, CANVAS_W - MARGIN - adpW, y + badgeH * 0.18);

  y += badgeH + 18;

  // 通称
  if (!isEmpty(card.alias)) {
    ctx.font = `${fAlias}px ${FONT}`;
    ctx.fillStyle = "#5a5a5a";
    ctx.fillText(`『${card.alias}』`, MARGIN, y);
    y += fAlias + 10;
  }

  // カード名
  ctx.font = `bold ${fName}px ${FONT}`;
  ctx.fillStyle = "#000";
  y = drawWrapped(ctx, card.name ?? "", MARGIN, y, CANVAS_W - 2 * MARGIN, Math.round(fName * 1.15)) + 6;

  // 属性
  ctx.font = `${fAttr}px ${FONT}`;
  ctx.fillStyle = "#505050";
  y = drawWrapped(ctx, card.attribute ?? "", MARGIN, y, CANVAS_W - 2 * MARGIN, Math.round(fAttr * 1.3)) + 10;

  // 区切り線
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(CANVAS_W - MARGIN, y);
  ctx.stroke();
  y += 22;

  // 効果1・2
  y = drawEffect(ctx, y, card.effectName1, card.mark1, card.effectContent1,
    { fEffName, fEffMark, fEffBody, FONT });
  y = drawEffect(ctx, y, card.effectName2, card.mark2, card.effectContent2,
    { fEffName, fEffMark, fEffBody, FONT });

  // フレーバーテキスト（下部ボックス）
  if (!isEmpty(card.column)) {
    ctx.font = `${fFlavor}px ${FONT}`;
    const flavor = String(card.column).replace(/\r\n|\n/g, " ");
    const lines = wrapText(ctx, flavor, CANVAS_W - 2 * MARGIN - 20);
    const lh = Math.round(fFlavor * 1.4);
    const boxH = lines.length * lh + 24;
    const boxTop = CANVAS_H - MARGIN - boxH;
    ctx.strokeStyle = "#969696";
    ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN, boxTop, CANVAS_W - 2 * MARGIN, boxH);
    ctx.fillStyle = "#646464";
    let fy = boxTop + 10;
    for (const line of lines) {
      ctx.fillText(line, MARGIN + 10, fy);
      fy += lh;
    }
  }

  // フッター
  ctx.font = `${fFoot}px ${FONT}`;
  ctx.fillStyle = "#969696";
  const footTxt = "※代理カード用メモ（プレイ用参考データ）";
  const footW = ctx.measureText(footTxt).width;
  ctx.fillText(footTxt, (CANVAS_W - footW) / 2, CANVAS_H - fFoot - 14);
}

function drawEffect(ctx, y, name, mark, content, F) {
  const hasName = !isEmpty(name);
  const hasContent = !isEmpty(content);
  if (!hasName && !hasContent) return y;

  if (hasName) {
    ctx.font = `bold ${F.fEffName}px ${F.FONT}`;
    ctx.fillStyle = "#000";
    ctx.fillText(name, MARGIN, y);
    const headerW = ctx.measureText(name).width;
    if (!isEmpty(mark) && mark !== "なし") {
      ctx.font = `${F.fEffMark}px ${F.FONT}`;
      ctx.fillStyle = "#3c3c3c";
      ctx.fillText(`【${mark}】`, MARGIN + headerW + 12, y + 6);
    }
    y += F.fEffName + 12;
  } else if (!isEmpty(mark) && mark !== "なし") {
    ctx.font = `${F.fEffMark}px ${F.FONT}`;
    ctx.fillStyle = "#3c3c3c";
    ctx.fillText(`【${mark}】`, MARGIN, y);
    y += F.fEffMark + 10;
  }

  if (hasContent) {
    ctx.font = `${F.fEffBody}px ${F.FONT}`;
    ctx.fillStyle = "#141414";
    y = drawWrapped(ctx, content, MARGIN, y, CANVAS_W - 2 * MARGIN, Math.round(F.fEffBody * 1.4));
  }
  y += 24;
  return y;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000";
  ctx.stroke();
}

// ---------- カード画像キャッシュ ----------
const imageCache = new Map();
function getCardDataURL(card) {
  const key = card.cardId || card.name;
  if (imageCache.has(key)) return imageCache.get(key);
  const canvas = document.getElementById("workCanvas");
  drawCard(canvas, card);
  const url = canvas.toDataURL("image/png");
  imageCache.set(key, url);
  return url;
}

// ---------- PDF生成 ----------
function buildPDF(cardList) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const gridW = COLS * CARD_W_MM + (COLS - 1) * GAP_MM;
  const gridH = ROWS * CARD_H_MM + (ROWS - 1) * GAP_MM;
  const marginX = (PAGE_W_MM - gridW) / 2;
  const marginY = (PAGE_H_MM - gridH) / 2;
  const drawW = CARD_W_MM - 2 * SHRINK_X_MM;
  const drawH = CARD_H_MM - 2 * SHRINK_Y_MM;

  const perPage = COLS * ROWS;
  for (let start = 0; start < cardList.length; start += perPage) {
    if (start > 0) pdf.addPage();
    const chunk = cardList.slice(start, start + perPage);
    chunk.forEach((card, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cellX = marginX + col * (CARD_W_MM + GAP_MM);
      const cellY = marginY + row * (CARD_H_MM + GAP_MM);
      const x = cellX + SHRINK_X_MM;
      const y = cellY + SHRINK_Y_MM;
      const dataUrl = getCardDataURL(card);
      pdf.addImage(dataUrl, "PNG", x, y, drawW, drawH);
    });
  }
  pdf.save("highsto_proxy_memo.pdf");
}

// ---------- UI ----------
const searchBox = document.getElementById("searchBox");
const resultsEl = document.getElementById("results");
const queueEl = document.getElementById("queue");
const totalCountEl = document.getElementById("totalCount");
const generateBtn = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");

function renderResults(matches) {
  resultsEl.innerHTML = "";
  dedupeVariants(matches)
    .slice(0, 30)
    .forEach((card) => {
      const li = document.createElement("li");
      li.style.cssText = "flex-direction:column; align-items:stretch;";
      const row = document.createElement("div");
      row.style.cssText = "display:flex; justify-content:space-between; align-items:flex-start; gap:8px; width:100%;";
      const label = document.createElement("div");
      const summary = effectSummary(card);
      label.innerHTML = `
        <div>${!isEmpty(card.alias) ? `<span class="alias">『${card.alias}』</span>` : ""}<span class="name">${card.name}</span></div>
        ${summary ? `<div class="effect-summary">${summary}</div>` : ""}
      `;
      const btnGroup = document.createElement("div");
      btnGroup.style.cssText = "display:flex; gap:6px; flex-shrink:0;";
      const refBtn = document.createElement("button");
      refBtn.textContent = "🔗 関連";
      refBtn.className = "ref-toggle";
      const btn = document.createElement("button");
      btn.textContent = "追加";
      btn.onclick = () => addToQueue(card);
      btnGroup.appendChild(refBtn);
      btnGroup.appendChild(btn);
      row.appendChild(label);
      row.appendChild(btnGroup);

      const panel = document.createElement("div");
      panel.className = "ref-panel";
      panel.style.display = "none";
      refBtn.onclick = () => {
        const open = panel.style.display !== "none";
        if (open) {
          panel.style.display = "none";
        } else {
          panel.innerHTML = buildRefPanelHTML(card, { withAddButton: true });
          panel.style.display = "block";
          panel.querySelectorAll(".ref-add").forEach((b) => {
            b.onclick = () => {
              const target = findCardByName(b.dataset.name);
              if (target) addToQueue(target);
            };
          });
        }
      };

      li.appendChild(row);
      li.appendChild(panel);
      resultsEl.appendChild(li);
    });
}

function addToQueue(card) {
  const existing = queue.find((q) => (q.card.cardId || q.card.name) === (card.cardId || card.name));
  if (existing) {
    existing.qty += 1;
  } else {
    queue.push({ card, qty: 1 });
  }
  renderQueue();
}

function renderQueue() {
  queueEl.innerHTML = "";
  let total = 0;
  queue.forEach((entry, idx) => {
    total += entry.qty;
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = entry.card.name;
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.value = entry.qty;
    qtyInput.onchange = () => {
      entry.qty = Math.max(1, parseInt(qtyInput.value) || 1);
      renderQueue();
    };
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "削除";
    removeBtn.className = "remove";
    removeBtn.onclick = () => {
      queue.splice(idx, 1);
      renderQueue();
    };
    li.appendChild(name);
    li.appendChild(qtyInput);
    li.appendChild(removeBtn);
    queueEl.appendChild(li);
  });
  totalCountEl.textContent = `(${total}枚)`;
  generateBtn.disabled = total === 0;
}

searchBox.addEventListener("input", () => {
  const q = searchBox.value.trim();
  if (!q) {
    resultsEl.innerHTML = "";
    return;
  }
  renderResults(searchCards(q));
});

generateBtn.addEventListener("click", () => {
  statusEl.textContent = "PDFを生成中…";
  generateBtn.disabled = true;
  setTimeout(() => {
    const cardList = [];
    queue.forEach((entry) => {
      for (let i = 0; i < entry.qty; i++) cardList.push(entry.card);
    });
    buildPDF(cardList);
    statusEl.textContent = `完了：${cardList.length}枚を出力しました`;
    generateBtn.disabled = false;
  }, 50);
});

loadData().then(() => {
  statusEl.textContent = `カードデータ読み込み完了（${allCards.length}件）`;
});

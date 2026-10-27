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
  const FONT = CARD_FONT;

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


// ---------- マーカー（状態異常／先攻・後攻） ----------
// 通常カードと同サイズ(63×88mm)の縦長カード。文字は横長レイアウトで描いて90度回転して載せる。
// 状態異常は cards.json の効果文で頻出する「〜できない」系の制限表現から作成。lines は表示時の改行位置。
const MARKER_PRESETS = [
  { category: "先攻・後攻", style: "turn", variant: "first", lines: ["先攻"] },
  { category: "先攻・後攻", style: "turn", variant: "second", lines: ["後攻"] },
  { category: "攻撃制限", lines: ["攻撃", "できない"] },
  { category: "攻撃制限", lines: ["1回までしか", "攻撃できない"] },
  { category: "攻撃制限", lines: ["2回までしか", "攻撃できない"] },
  { category: "攻撃制限", lines: ["山札に", "攻撃できない"] },
  { category: "攻撃制限", lines: ["ブロック", "できない"] },
  { category: "セット・召喚制限", lines: ["セット", "できない"] },
  { category: "セット・召喚制限", lines: ["1枚までしか", "セットできない"] },
  { category: "セット・召喚制限", lines: ["ランク2以上を", "セットできない"] },
  { category: "セット・召喚制限", lines: ["召喚", "できない"] },
  { category: "セット・召喚制限", lines: ["セットせずに", "召喚できない"] },
  { category: "セット・召喚制限", lines: ["セット・召喚", "できない"] },
  { category: "セット・召喚制限", lines: ["ランク1以上を", "セットせずに", "召喚できない"] },
  { category: "セット・召喚制限", lines: ["ランク2以上を", "セットせずに", "召喚できない"] },
  { category: "その他の制限", lines: ["アクティブに", "できない"] },
  { category: "その他の制限", lines: ["「召」の効果は", "発動できない"] },
  { category: "その他の制限", lines: ["｛身代わり｝を", "発動できない"] },
];

// マーカーの表示設定（画面のパネルから変更）
const markerSettings = {
  rotation: 90, // 文字の向き：90＝右に90度（上から下へ読む）、-90＝左に90度
  bgOpacity: 0.25, // 背景画像の濃さ（0〜1）
  bgCanvas: null, // グレースケール化・カードサイズにリサイズ済みの背景
};

function makeMarkerCard(category, lines, style = "forbid", variant = "") {
  const text = lines.join("");
  return {
    isMarker: true,
    cardId: `marker:${category}:${text}`,
    name: `【マーカー】${text}`,
    markerCategory: category,
    markerLines: lines,
    markerStyle: style,
    markerVariant: variant,
  };
}

// 禁止マーク（円＋斜線）をキャンバスに描く
function drawProhibitSign(ctx, cx, cy, r) {
  ctx.strokeStyle = "#000";
  ctx.lineWidth = Math.round(r * 0.2);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const d = r * Math.SQRT1_2;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.stroke();
}

// 先攻＝黒丸（塗りつぶし）、後攻＝白丸（太枠）。白黒印刷でも区別できる
function drawTurnBadge(ctx, cx, cy, r, first) {
  if (first) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const lw = Math.round(r * 0.2);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// 横長レイアウト(880×630)でマーカーの中身を描く（外枠・背景は呼び出し側）
const MARKER_W = CARD_H_MM * SCALE; // 880
const MARKER_H = CARD_W_MM * SCALE; // 630
function drawMarkerContent(ctx, card) {
  const FONT = CARD_FONT;
  const isTurn = card.markerStyle === "turn";
  const hasBg = !!markerSettings.bgCanvas;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  // 左：禁止マーク／先攻後攻バッジ
  if (isTurn) drawTurnBadge(ctx, 200, MARKER_H / 2 - 8, 130, card.markerVariant === "first");
  else drawProhibitSign(ctx, 200, MARKER_H / 2 - 8, 130);

  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  // 右：カテゴリ名＋文言
  const zoneL = 380;
  const zoneR = MARKER_W - MARGIN;
  const zoneCx = (zoneL + zoneR) / 2;
  const fCat = Math.round(MARKER_H * 0.06);
  const drawText = (t, x, y, color) => {
    if (hasBg) {
      // 背景画像の上でも読めるよう白フチを付ける
      ctx.lineJoin = "round";
      ctx.lineWidth = 10;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(t, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  };
  ctx.font = `bold ${fCat}px ${FONT}`;
  drawText(card.markerCategory || "マーカー", zoneCx, MARGIN + 6, "#444");

  // 文言（最も長い行が右ゾーンに収まるようフォントを自動調整）
  const maxW = zoneR - zoneL - 10;
  const lines = card.markerLines;
  let fs = isTurn ? 190 : 104;
  while (fs > 24) {
    ctx.font = `bold ${fs}px ${FONT}`;
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= maxW) break;
    fs -= 2;
  }
  const textTop = MARGIN + fCat + 30;
  const textH = MARKER_H - MARGIN - 40 - textTop;
  while (fs > 24 && lines.length * Math.round(fs * 1.25) > textH) fs -= 2;
  ctx.font = `bold ${fs}px ${FONT}`;
  const lh = Math.round(fs * 1.25);
  let y = textTop + Math.max(0, (textH - lines.length * lh) / 2);
  for (const line of lines) {
    drawText(line, zoneCx, y, "#000");
    y += lh;
  }

  // フッター
  const fFoot = Math.round(MARKER_H * 0.03);
  ctx.font = `${fFoot}px ${FONT}`;
  drawText(`※${isTurn ? "先攻・後攻" : "状態"}マーカー（プレイ用）`, MARKER_W / 2, MARKER_H - fFoot - 14, "#8a8a8a");
  ctx.textAlign = "start";
}

function drawMarker(canvas, card) {
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 背景画像（グレースケール化済み。薄く重ねる）
  if (markerSettings.bgCanvas) {
    ctx.globalAlpha = markerSettings.bgOpacity;
    ctx.drawImage(markerSettings.bgCanvas, 0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }

  // 外枠（切り取り基準。通常カードと同じで、回転しない）
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, CANVAS_W - 12, CANVAS_H - 12);

  // 中身は横長で描いて、縦長カードに90度回転して載せる
  ctx.save();
  if (markerSettings.rotation === -90) {
    ctx.translate(0, CANVAS_H);
    ctx.rotate(-Math.PI / 2);
  } else {
    ctx.translate(CANVAS_W, 0);
    ctx.rotate(Math.PI / 2);
  }
  drawMarkerContent(ctx, card);
  ctx.restore();
}

// アップロード画像 → グレースケール化＋カードサイズ(630×880)に「全面を覆う」リサイズ（はみ出しは中央でトリミング）
function setMarkerBackground(img) {
  const c = document.createElement("canvas");
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; // 透過PNGは白地に合成
  x.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const sc = Math.max(CANVAS_W / iw, CANVAS_H / ih);
  const w = iw * sc;
  const h = ih * sc;
  x.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
  const d = x.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const g = Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]);
    p[i] = p[i + 1] = p[i + 2] = g;
    p[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  markerSettings.bgCanvas = c;
}

function loadMarkerBackground(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        setMarkerBackground(img);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}

// ---------- フォント（ユニバーサルデザイン書体：BIZ UDPゴシック） ----------
// 見分けやすさを重視したUD書体（セリフなし）。Google Fontsから配信し、未取得時は従来のゴシック体にフォールバック。
const CARD_FONT = "'BIZ UDPGothic','BIZ UDGothic','Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

// 描画前に、使用する文字を含むフォント分割(subset)を確実に読み込む（canvasは自動でWebフォントを待たないため）
async function ensureFonts(cards) {
  if (!document.fonts || !document.fonts.load) return true;
  const text = Array.from(new Set(cards.flatMap((c) =>
    Object.values(c).filter((v) => typeof v === "string").join("").concat((c.markerLines || []).join(""))
  ).join(""))).join("");
  const sample = text.slice(0, 3000) + "0123456789あいうアイウ漢字";
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`16px 'BIZ UDPGothic'`, sample),
        document.fonts.load(`bold 16px 'BIZ UDPGothic'`, sample),
      ]),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    return document.fonts.check(`16px 'BIZ UDPGothic'`);
  } catch (e) {
    return false;
  }
}

// ---------- カード画像キャッシュ ----------
const imageCache = new Map();
function getCardDataURL(card) {
  const key = card.cardId || card.name;
  if (imageCache.has(key)) return imageCache.get(key);
  const canvas = document.getElementById("workCanvas");
  if (card.isMarker) drawMarker(canvas, card);
  else drawCard(canvas, card);
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
const filterAttackDefenseEl = document.getElementById("filterAttackDefense");
const filterRankEl = document.getElementById("filterRank");
const filterAttributeEl = document.getElementById("filterAttribute");

function populateFilterOptions() {
  const { attributes, attackDefenses, ranks } = getFilterOptions();
  for (const v of attackDefenses) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    filterAttackDefenseEl.appendChild(opt);
  }
  for (const v of ranks) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    filterRankEl.appendChild(opt);
  }
  for (const v of attributes) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    filterAttributeEl.appendChild(opt);
  }
}

function runSearch() {
  const q = searchBox.value.trim();
  const criteria = {
    query: q,
    attackDefense: filterAttackDefenseEl.value,
    rank: filterRankEl.value,
    attribute: filterAttributeEl.value,
  };
  const hasFilter = criteria.attackDefense || criteria.rank || criteria.attribute;
  if (!q && !hasFilter) {
    resultsEl.innerHTML = "";
    return;
  }
  renderResults(filterCards(criteria), q);
}

function renderResults(matches, query) {
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
      const snippet = matchSnippet(card, query);
      label.innerHTML = `
        <div>${!isEmpty(card.alias) ? `<span class="alias">『${card.alias}』</span>` : ""}<span class="name">${card.name}</span></div>
        ${summary ? `<div class="effect-summary">${summary}</div>` : ""}
        ${snippet ? `<div class="match-snippet"><span class="match-field">${snippet.field}</span>${snippet.text}</div>` : ""}
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

function addToQueue(card, qty = 1) {
  const existing = queue.find((q) => (q.card.cardId || q.card.name) === (card.cardId || card.name));
  if (existing) {
    existing.qty += qty;
  } else {
    queue.push({ card, qty });
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

searchBox.addEventListener("input", runSearch);
filterAttackDefenseEl.addEventListener("change", runSearch);
filterRankEl.addEventListener("change", runSearch);
filterAttributeEl.addEventListener("change", runSearch);

generateBtn.addEventListener("click", async () => {
  statusEl.textContent = "PDFを生成中…（フォント読み込み）";
  generateBtn.disabled = true;
  const cardList = [];
  queue.forEach((entry) => {
    for (let i = 0; i < entry.qty; i++) cardList.push(entry.card);
  });
  const fontOk = await ensureFonts(queue.map((e) => e.card));
  buildPDF(cardList);
  statusEl.textContent = `完了：${cardList.length}枚を出力しました` +
    (fontOk ? "" : "（UD書体を取得できなかったため、標準ゴシック体で出力）");
  generateBtn.disabled = false;
});

// ---------- 状態異常マーカー UI ----------
const toggleMarkerBtn = document.getElementById("toggleMarkerBtn");
const markerPanel = document.getElementById("markerPanel");
const markerListEl = document.getElementById("markerList");
const markerCustomInput = document.getElementById("markerCustomInput");
const markerCustomBtn = document.getElementById("markerCustomBtn");

function renderMarkerList() {
  markerListEl.innerHTML = "";
  let lastCategory = "";
  for (const preset of MARKER_PRESETS) {
    if (preset.category !== lastCategory) {
      const h = document.createElement("li");
      h.className = "marker-heading";
      h.textContent = preset.category;
      markerListEl.appendChild(h);
      lastCategory = preset.category;
    }
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = preset.lines.join("");
    const btn = document.createElement("button");
    btn.textContent = "追加";
    btn.onclick = () => addToQueue(makeMarkerCard(preset.category, preset.lines, preset.style, preset.variant));
    li.appendChild(label);
    li.appendChild(btn);
    markerListEl.appendChild(li);
  }
}

const markerPreviewImg = document.getElementById("markerPreview");
const markerRotationEl = document.getElementById("markerRotation");
const markerBgInput = document.getElementById("markerBgInput");
const markerBgOpacityEl = document.getElementById("markerBgOpacity");
const markerBgOpacityValEl = document.getElementById("markerBgOpacityVal");
const markerBgClearBtn = document.getElementById("markerBgClearBtn");
const markerBgStatusEl = document.getElementById("markerBgStatus");

// 設定変更後：マーカーの描画キャッシュを破棄し、プレビューを更新
async function refreshMarkerPreview() {
  for (const key of [...imageCache.keys()]) if (String(key).startsWith("marker:")) imageCache.delete(key);
  const sample = makeMarkerCard("攻撃制限", ["攻撃", "できない"]);
  await ensureFonts([sample]);
  markerPreviewImg.src = getCardDataURL(sample);
}

toggleMarkerBtn.addEventListener("click", () => {
  const open = markerPanel.style.display === "none";
  markerPanel.style.display = open ? "block" : "none";
  if (open) refreshMarkerPreview();
});

markerRotationEl.addEventListener("change", () => {
  markerSettings.rotation = Number(markerRotationEl.value);
  refreshMarkerPreview();
});

markerBgOpacityEl.addEventListener("input", () => {
  markerSettings.bgOpacity = Number(markerBgOpacityEl.value) / 100;
  markerBgOpacityValEl.textContent = `${markerBgOpacityEl.value}%`;
  refreshMarkerPreview();
});

markerBgInput.addEventListener("change", async () => {
  const file = markerBgInput.files && markerBgInput.files[0];
  if (!file) return;
  markerBgStatusEl.textContent = "読み込み中…";
  try {
    await loadMarkerBackground(file);
    markerBgStatusEl.textContent = `背景を設定しました（${file.name}／グレースケール・カードサイズに変換。画像はブラウザ内でのみ処理されます）`;
    await refreshMarkerPreview();
  } catch (e) {
    markerBgStatusEl.textContent = "画像を読み込めませんでした（JPEG・PNG・WebPなどをお試しください）。";
  }
});

markerBgClearBtn.addEventListener("click", () => {
  markerSettings.bgCanvas = null;
  markerBgInput.value = "";
  markerBgStatusEl.textContent = "背景を削除しました。";
  refreshMarkerPreview();
});

// 自由入力：改行位置は「/」で指定（例：次のターン/攻撃できない）。省略時は全体を1行として自動縮小
markerCustomBtn.addEventListener("click", () => {
  const raw = markerCustomInput.value.trim();
  if (!raw) return;
  const lines = raw.split("/").map((l) => l.trim()).filter(Boolean).slice(0, 5);
  addToQueue(makeMarkerCard("カスタム", lines));
  markerCustomInput.value = "";
});

renderMarkerList();

// ---------- CSV一括登録（deck_code / card_id / count 列を持つエクスポートCSVを想定） ----------

// RFC4180準拠の簡易CSVパーサー（引用符内の改行・カンマ・""エスケープに対応）
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, ""); // BOM除去
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((c) => c !== "")) rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    return obj;
  });
}

function importCSV(text) {
  let records;
  try {
    records = parseCSV(text);
  } catch (e) {
    csvStatusEl.textContent = "CSVの解析に失敗しました。形式をご確認ください。";
    return;
  }
  if (!records.length) {
    csvStatusEl.textContent = "有効な行が見つかりませんでした。";
    return;
  }

  // 同一card_idが複数行にまたがる場合はcountを合算する
  const grouped = new Map(); // cardId -> { count, name }
  const missing = [];
  for (const r of records) {
    const cardId = (r.card_id || "").trim();
    const count = parseInt(r.count, 10) || 0;
    if (!cardId || count <= 0) continue;
    if (grouped.has(cardId)) {
      grouped.get(cardId).count += count;
    } else {
      grouped.set(cardId, { count, name: r.card_name || cardId });
    }
  }

  let addedCards = 0;
  let addedCount = 0;
  for (const [cardId, info] of grouped) {
    const card = findCardById(cardId);
    if (!card) {
      missing.push(`${info.name}（${cardId}）`);
      continue;
    }
    addToQueue(card, info.count);
    addedCards++;
    addedCount += info.count;
  }

  const deckCode = records[0].deck_code ? `デッキコード「${records[0].deck_code}」／` : "";
  let msg = `${deckCode}${addedCards}種類・${addedCount}枚をキューに追加しました。`;
  if (missing.length) {
    msg += ` （カードDBに見つからず未登録：${missing.length}件）`;
  }
  csvStatusEl.textContent = msg;
  if (missing.length) {
    const detail = document.createElement("div");
    detail.className = "csv-missing";
    detail.textContent = "未登録：" + missing.join("、");
    csvStatusEl.appendChild(document.createElement("br"));
    csvStatusEl.appendChild(detail);
  }
}

const toggleCsvBtn = document.getElementById("toggleCsvBtn");
const csvPanel = document.getElementById("csvPanel");
const csvInput = document.getElementById("csvInput");
const csvImportBtn = document.getElementById("csvImportBtn");
const csvStatusEl = document.getElementById("csvStatus");

toggleCsvBtn.addEventListener("click", () => {
  csvPanel.style.display = csvPanel.style.display === "none" ? "block" : "none";
});

csvImportBtn.addEventListener("click", () => {
  const text = csvInput.value.trim();
  if (!text) {
    csvStatusEl.textContent = "CSVを貼り付けてください。";
    return;
  }
  importCSV(text);
});

loadData().then(() => {
  populateFilterOptions();
  statusEl.textContent = `カードデータ読み込み完了（${allCards.length}件）`;
});

/* common.js — 代理カード作成アプリ・カード検索/関連カード探索アプリで共有するロジック
 * データ読み込み、部分一致検索、参照関係マップの構築を担当する。
 */

const DATA_URL = "data/cards.json";
let allCards = [];

async function loadData() {
  const res = await fetch(DATA_URL);
  const json = await res.json();
  allCards = json.cards || [];
  buildReferenceIndex();
  return allCards;
}

function isEmpty(v) {
  return !v || v === "ー" || v === "-";
}

function effectSummary(card) {
  const names = [card.effectName1, card.effectName2].filter((n) => !isEmpty(n));
  return names.join("・");
}

// 同一名・同一通称・同一効果・同一ステータスの再録違いを1件にまとめる
function variantKey(card) {
  return [
    card.name,
    card.alias || "",
    card.effectName1 || "",
    card.effectName2 || "",
    card.rank,
    card.power,
    card.attackDefense,
  ].join("|");
}

function dedupeVariants(matches) {
  const seen = new Map();
  for (const card of matches) {
    const key = variantKey(card);
    if (!seen.has(key)) seen.set(key, card);
  }
  return [...seen.values()];
}

function findCardByName(name) {
  return allCards.find((c) => c.name === name);
}

// カード名・通称・能力名の部分一致検索
function searchCards(query) {
  const q = (query || "").trim();
  if (!q) return [];
  return allCards.filter(
    (c) =>
      (c.name && c.name.includes(q)) ||
      (c.alias && c.alias.includes(q)) ||
      (c.effectName1 && c.effectName1.includes(q)) ||
      (c.effectName2 && c.effectName2.includes(q))
  );
}

// ---------- カード間の参照関係マップ ----------
// 効果文中の〈...〉表記を検出し、他カードへの参照関係を構築する。
// 〈織田信長〉のようにカード名と完全一致するものは「直接参照」、
// 〈武田〉〈真田〉のように一族・シリーズを示す部分一致は「系統参照」として扱う。
const REF_PATTERN = /〈([^〉]+)〉/g;
let referenceIndex = new Map(); // name -> [{ token, matchType, targets:[name,...] }]
let incomingIndex = new Map(); // name -> [{ fromName, token, matchType }]

function buildReferenceIndex() {
  referenceIndex = new Map();
  incomingIndex = new Map();
  const uniqueNames = [...new Set(allCards.map((c) => c.name))];
  const nameSet = new Set(uniqueNames);
  const seenCardNames = new Set();

  for (const card of allCards) {
    if (seenCardNames.has(card.name)) continue; // 再録は名前単位で1回だけ処理
    seenCardNames.add(card.name);

    const text = (card.effectContent1 || "") + (card.effectContent2 || "");
    const tokens = [...text.matchAll(REF_PATTERN)].map((m) => m[1]);
    if (!tokens.length) continue;

    const entry = [];
    for (const token of tokens) {
      if (entry.some((e) => e.token === token)) continue; // 同トークンは1回だけ
      let matchType, targets;
      if (nameSet.has(token) && token !== card.name) {
        matchType = "exact";
        targets = [token];
      } else if (!nameSet.has(token)) {
        targets = uniqueNames.filter((n) => n.includes(token) && n !== card.name);
        if (!targets.length) continue;
        matchType = "family";
      } else {
        continue; // 自分自身への参照は無視
      }
      entry.push({ token, matchType, targets });
      for (const target of targets) {
        if (!incomingIndex.has(target)) incomingIndex.set(target, []);
        const inc = incomingIndex.get(target);
        if (!inc.some((e) => e.fromName === card.name && e.token === token)) {
          inc.push({ fromName: card.name, token, matchType });
        }
      }
    }
    if (entry.length) referenceIndex.set(card.name, entry);
  }
}

function refTargetLabel(target) {
  const c = findCardByName(target);
  const summary = c ? effectSummary(c) : "";
  return `<span class="ref-name">${target}</span>${summary ? `<span class="ref-effect">${summary}</span>` : ""}`;
}

// options.withAddButton: true の場合、各参照先に代理メモキューへの「追加」ボタンを付ける
function buildRefPanelHTML(card, options = {}) {
  const withAdd = !!options.withAddButton;
  const outgoing = referenceIndex.get(card.name) || [];
  const incoming = incomingIndex.get(card.name) || [];

  if (!outgoing.length && !incoming.length) {
    return `<p class="ref-empty">このカードには参照関係が見つかりませんでした。</p>`;
  }

  const addBtn = (name) => (withAdd ? `<button class="ref-add" data-name="${name}">追加</button>` : "");

  let html = "";
  if (outgoing.length) {
    html += `<div class="ref-block"><div class="ref-heading">→ このカードが参照するカード</div><ul class="ref-list">`;
    for (const ref of outgoing) {
      const isFamily = ref.matchType === "family";
      html += `<li><span class="ref-token">〈${ref.token}〉${isFamily ? `<span class="ref-tag">系統</span>` : ""}</span><ul class="ref-targets">`;
      for (const t of ref.targets.slice(0, 8)) {
        html += `<li>${refTargetLabel(t)}${addBtn(t)}</li>`;
      }
      if (ref.targets.length > 8) html += `<li class="ref-more">他${ref.targets.length - 8}件</li>`;
      html += `</ul></li>`;
    }
    html += `</ul></div>`;
  }
  if (incoming.length) {
    html += `<div class="ref-block"><div class="ref-heading">← このカードを参照しているカード</div><ul class="ref-targets">`;
    for (const inc of incoming.slice(0, 10)) {
      html += `<li>${refTargetLabel(inc.fromName)}${addBtn(inc.fromName)}</li>`;
    }
    if (incoming.length > 10) html += `<li class="ref-more">他${incoming.length - 10}件</li>`;
    html += `</ul></div>`;
  }
  return html;
}

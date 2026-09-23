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

// name/alias/effectNameは検索結果に既に表示されるため、属性・効果本文がヒットした場合のみ
// 「どこにマッチしたか」の抜粋を返す（それ以外はnull）
function matchSnippet(card, query) {
  const q = (query || "").trim();
  if (!q) return null;
  if (card.attribute && card.attribute.includes(q)) {
    return { field: "属性", text: card.attribute };
  }
  for (const key of ["effectContent1", "effectContent2"]) {
    const text = card[key];
    if (text && text.includes(q)) {
      const idx = text.indexOf(q);
      const start = Math.max(0, idx - 8);
      const end = Math.min(text.length, idx + q.length + 8);
      const snippet = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
      return { field: "効果文", text: snippet };
    }
  }
  return null;
}

function findCardByName(name) {
  return allCards.find((c) => c.name === name);
}

// カード名・通称・能力名・属性・効果テキストの部分一致検索
function searchCards(query) {
  return filterCards({ query });
}

// 属性・攻撃/防御/事変・ランク/レベルのフィルター選択肢を実データから抽出する
function getFilterOptions() {
  const attributeCounts = new Map();
  const adCounts = new Map();
  const rankSet = new Set();
  for (const c of allCards) {
    if (c.attribute) {
      for (const token of c.attribute.split("・")) {
        if (!token) continue;
        attributeCounts.set(token, (attributeCounts.get(token) || 0) + 1);
      }
    }
    if (c.attackDefense) adCounts.set(c.attackDefense, (adCounts.get(c.attackDefense) || 0) + 1);
    if (c.rank !== undefined && c.rank !== null && c.rank !== "") rankSet.add(String(c.rank));
  }
  const attributes = [...attributeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token);
  const attackDefenses = [...adCounts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  const ranks = [...rankSet].sort((a, b) => Number(a) - Number(b));
  return { attributes, attackDefenses, ranks };
}

// 攻を選ぶと「攻」と「両」、防を選ぶと「防」と「両」もヒットさせる（両は攻防兼用のため）。
// 両・事変は選んだ値そのものだけに厳密一致させる。
function attackDefenseMatches(cardValue, filterValue) {
  if (!filterValue) return true;
  if (filterValue === "攻") return cardValue === "攻" || cardValue === "両";
  if (filterValue === "防") return cardValue === "防" || cardValue === "両";
  return cardValue === filterValue; // 両・事変・その他は厳密一致
}

// query（自由テキスト）と、attribute・attackDefense・rankの構造化フィルターをAND条件で組み合わせる
function filterCards(criteria = {}) {
  const q = (criteria.query || "").trim();
  const { attribute, attackDefense, rank } = criteria;
  return allCards.filter((c) => {
    if (attribute && !(c.attribute && c.attribute.split("・").includes(attribute))) return false;
    if (attackDefense && !attackDefenseMatches(c.attackDefense, attackDefense)) return false;
    if (rank && String(c.rank) !== String(rank)) return false;
    if (!q) return true;
    return (
      (c.name && c.name.includes(q)) ||
      (c.alias && c.alias.includes(q)) ||
      (c.effectName1 && c.effectName1.includes(q)) ||
      (c.effectName2 && c.effectName2.includes(q)) ||
      (c.attribute && c.attribute.includes(q)) ||
      (c.effectContent1 && c.effectContent1.includes(q)) ||
      (c.effectContent2 && c.effectContent2.includes(q))
    );
  });
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
      for (const t of ref.targets) {
        html += `<li data-name="${t}">${refTargetLabel(t)}${addBtn(t)}</li>`;
      }
      html += `</ul></li>`;
    }
    html += `</ul></div>`;
  }
  if (incoming.length) {
    html += `<div class="ref-block"><div class="ref-heading">← このカードを参照しているカード（${incoming.length}件）</div><ul class="ref-targets">`;
    for (const inc of incoming) {
      html += `<li data-name="${inc.fromName}">${refTargetLabel(inc.fromName)}${addBtn(inc.fromName)}</li>`;
    }
    html += `</ul></div>`;
  }
  return html;
}

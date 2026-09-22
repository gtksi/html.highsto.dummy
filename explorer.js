/* explorer.js — カード検索・関連カード探索アプリ
 * common.js の検索・参照マップロジックを使い、カード詳細と関連カードを表示する。
 */

const searchBox = document.getElementById("searchBox");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");

// 同一名・通称・効果・ステータスを持つ全ての再録（収録商品違い）を集める
function findAllPrints(card) {
  const key = [
    card.name,
    card.alias || "",
    card.effectName1 || "",
    card.effectName2 || "",
    card.rank,
    card.power,
    card.attackDefense,
  ].join("|");
  return allCards.filter(
    (c) =>
      [c.name, c.alias || "", c.effectName1 || "", c.effectName2 || "", c.rank, c.power, c.attackDefense].join(
        "|"
      ) === key
  );
}

function effectBlockHTML(name, mark, content) {
  const hasName = !isEmpty(name);
  const hasContent = !isEmpty(content);
  if (!hasName && !hasContent) return "";
  return `
    <div class="detail-effect">
      ${hasName ? `<span class="detail-effect-name">${name}</span>` : ""}
      ${!isEmpty(mark) && mark !== "なし" ? `<span class="detail-mark">【${mark}】</span>` : ""}
      ${hasContent ? `<div class="detail-effect-body">${content}</div>` : ""}
    </div>
  `;
}

function buildDetailHTML(card) {
  const prints = findAllPrints(card);
  let html = `<div class="card-detail">`;
  html += `<div class="detail-row"><span class="detail-badge">ランク${card.rank ?? ""}</span><span class="detail-adp">${card.attackDefense ?? ""} / ${card.power ?? ""}</span></div>`;
  if (!isEmpty(card.attribute)) html += `<div class="detail-attr">${card.attribute}</div>`;
  html += effectBlockHTML(card.effectName1, card.mark1, card.effectContent1);
  html += effectBlockHTML(card.effectName2, card.mark2, card.effectContent2);
  if (!isEmpty(card.column)) html += `<div class="detail-flavor">${card.column}</div>`;

  if (prints.length) {
    html += `<div class="ref-block"><div class="ref-heading">収録商品（${prints.length}件）</div><ul class="print-list">`;
    for (const p of prints) {
      html += `<li>${p.packId || "?"} No.${p.cardNumber || "?"}${p.rarity ? " ／ " + p.rarity : ""}</li>`;
    }
    html += `</ul></div>`;
  }
  html += `</div>`;
  html += buildRefPanelHTML(card);
  return html;
}

// 参照リスト内のカード名をクリックすると、その場でカード詳細（効果文・収録商品・
// さらにその先の関連カード）を入れ子で展開できるようにする
function wireRefClicks(container) {
  container.querySelectorAll(":scope > .ref-block .ref-targets > li[data-name]").forEach((li) => {
    // 既にネスト展開済みの子要素はスキップ（二重配線防止）
    if (li.dataset.wired) return;
    li.dataset.wired = "1";
    li.style.cursor = "pointer";
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = li.querySelector(":scope > .nested-detail");
      if (existing && existing.contains(e.target)) return; // 展開済み詳細内のクリックは何もしない
      if (existing) {
        existing.remove();
        return;
      }
      const target = findCardByName(li.dataset.name);
      if (!target) return;
      const nested = document.createElement("div");
      nested.className = "nested-detail";
      nested.innerHTML = buildDetailHTML(target);
      li.appendChild(nested);
      wireRefClicks(nested);
    });
  });
}

function renderResults(matches) {
  resultsEl.innerHTML = "";
  dedupeVariants(matches)
    .slice(0, 30)
    .forEach((card) => {
      const li = document.createElement("li");
      li.style.cssText = "flex-direction:column; align-items:stretch;";
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex; justify-content:space-between; align-items:flex-start; gap:8px; width:100%; cursor:pointer;";
      const label = document.createElement("div");
      const summary = effectSummary(card);
      label.innerHTML = `
        <div>${!isEmpty(card.alias) ? `<span class="alias">『${card.alias}』</span>` : ""}<span class="name">${card.name}</span></div>
        ${summary ? `<div class="effect-summary">${summary}</div>` : ""}
      `;
      const toggle = document.createElement("span");
      toggle.textContent = "詳細 ▼";
      toggle.className = "detail-toggle";
      row.appendChild(label);
      row.appendChild(toggle);

      const panel = document.createElement("div");
      panel.className = "ref-panel";
      panel.style.display = "none";

      row.onclick = () => {
        const open = panel.style.display !== "none";
        if (open) {
          panel.style.display = "none";
          toggle.textContent = "詳細 ▼";
        } else {
          panel.innerHTML = buildDetailHTML(card);
          panel.style.display = "block";
          toggle.textContent = "詳細 ▲";
          wireRefClicks(panel);
        }
      };

      li.appendChild(row);
      li.appendChild(panel);
      resultsEl.appendChild(li);
    });
}

searchBox.addEventListener("input", () => {
  const q = searchBox.value.trim();
  if (!q) {
    resultsEl.innerHTML = "";
    return;
  }
  renderResults(searchCards(q));
});

loadData().then(() => {
  statusEl.textContent = `カードデータ読み込み完了（${allCards.length}件）`;
});

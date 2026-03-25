import { createPortal } from "react-dom";

type IngCategory = "Gemüse" | "Fleisch & Fisch" | "Milchprodukte" | "Vorrat" | "Sonstiges";

const catEmoji: Record<IngCategory, string> = {
  "Gemüse": "🥦",
  "Fleisch & Fisch": "🥩",
  "Milchprodukte": "🧀",
  "Vorrat": "🫙",
  "Sonstiges": "🛒",
};

export interface PrintOptions {
  showDateRange: boolean;
  showChecked: boolean;
  showRecipeSources: boolean;
}

interface ShoppingListPrintViewProps {
  grouped: Partial<Record<IngCategory, string[]>>;
  catOrder: IngCategory[];
  checked: Set<string>;
  options: PrintOptions;
  dateRangeLabel: string;
  recipeSources: Partial<Record<IngCategory, string[]>>;
}

export default function ShoppingListPrintView({
  grouped,
  catOrder,
  checked,
  options,
  dateRangeLabel,
  recipeSources,
}: ShoppingListPrintViewProps) {
  const printDate = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const appUrl =
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "";

  const activeCats = catOrder.filter((cat) => {
    const items = grouped[cat] ?? [];
    if (!options.showChecked) {
      return items.some((ing) => !checked.has(`${cat}::${ing}`));
    }
    return items.length > 0;
  });

  return createPortal(
    <div className="sl-print-only sl-print-view">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');

        @media print {
          html, body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body > *:not(.sl-print-only) {
            display: none !important;
          }
          .sl-print-only {
            display: flex !important;
          }
          @page {
            margin: 16mm 16mm 16mm 16mm;
            size: A4 portrait;
            background: #fff;
          }
        }

        .sl-print-only {
          display: none;
        }

        .sl-print-view {
          font-family: Arial, Helvetica, sans-serif;
          color: #1a1a0e;
          max-width: 800px;
          margin: 0 auto;
          background: #fff;
          flex-direction: column;
          min-height: 100vh;
        }

        .sl-print-content {
          flex: 1 1 auto;
        }

        .sl-header-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 2px;
        }

        .sl-logo {
          font-family: 'Dancing Script', 'Brush Script MT', cursive;
          font-size: 36px;
          font-weight: 700;
          color: #1a1a0e;
          line-height: 1.1;
          margin: 0;
          letter-spacing: 0.01em;
        }

        .sl-header-date {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          color: #666;
          letter-spacing: 0.04em;
        }

        .sl-header-rule {
          border: none;
          border-top: 1.5px solid #1a1a0e;
          border-bottom: 1px solid #1a1a0e;
          height: 4px;
          background: transparent;
          margin: 4px 0 14px 0;
        }

        .sl-title-row {
          margin-bottom: 18px;
        }

        .sl-title {
          font-family: 'Dancing Script', 'Brush Script MT', cursive;
          font-size: 28px;
          font-weight: 700;
          color: #1a1a0e;
          margin: 0 0 2px 0;
          line-height: 1.2;
        }

        .sl-date-range {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: #555;
          font-style: italic;
        }

        .sl-categories-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px 24px;
        }

        .sl-category {
          break-inside: avoid;
        }

        .sl-cat-header {
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #3a3a2a;
          border-bottom: 1px solid #ccc;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }

        .sl-item-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sl-item {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          font-size: 11px;
          line-height: 1.4;
          break-inside: avoid;
        }

        .sl-checkbox {
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          border: 1.5px solid #555;
          margin-top: 1px;
          display: inline-block;
        }

        .sl-item-text {
          flex: 1;
        }

        .sl-item-checked .sl-item-text {
          text-decoration: line-through;
          color: #aaa;
        }

        .sl-item-checked .sl-checkbox {
          border-color: #aaa;
          background: #f0f0f0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .sl-sources {
          margin-top: 5px;
          font-size: 9px;
          color: #999;
          font-style: italic;
          line-height: 1.4;
        }

        .sl-footer {
          margin-top: 24px;
          padding-top: 8px;
          border-top: 1px solid #ddd;
          display: flex;
          justify-content: center;
        }

        .sl-footer-url {
          font-size: 9px;
          font-family: Arial, Helvetica, sans-serif;
          color: #bbb;
          letter-spacing: 0.03em;
        }
      `}</style>

      <div className="sl-print-content">
        <div className="sl-header-top">
          <div className="sl-logo">Lucias Küche</div>
          <div className="sl-header-date">Gedruckt am {printDate}</div>
        </div>
        <div className="sl-header-rule" />

        <div className="sl-title-row">
          <div className="sl-title">Einkaufsliste</div>
          {options.showDateRange && dateRangeLabel && (
            <div className="sl-date-range">{dateRangeLabel}</div>
          )}
        </div>

        <div className="sl-categories-grid">
          {activeCats.map((cat) => {
            const items = grouped[cat] ?? [];
            const visibleItems = options.showChecked
              ? items
              : items.filter((ing) => !checked.has(`${cat}::${ing}`));

            if (visibleItems.length === 0) return null;

            const sources = recipeSources[cat] ?? [];

            return (
              <div key={cat} className="sl-category">
                <div className="sl-cat-header">
                  <span>{catEmoji[cat]}</span>
                  <span>{cat}</span>
                </div>
                <ul className="sl-item-list">
                  {visibleItems.map((ing) => {
                    const key = `${cat}::${ing}`;
                    const isChecked = checked.has(key);
                    return (
                      <li
                        key={key}
                        className={`sl-item${isChecked ? " sl-item-checked" : ""}`}
                      >
                        <span className="sl-checkbox" />
                        <span className="sl-item-text">{ing}</span>
                      </li>
                    );
                  })}
                </ul>
                {options.showRecipeSources && sources.length > 0 && (
                  <div className="sl-sources">
                    Rezepte: {sources.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sl-footer">
        <div className="sl-footer-url">{appUrl}</div>
      </div>
    </div>,
    document.body
  );
}

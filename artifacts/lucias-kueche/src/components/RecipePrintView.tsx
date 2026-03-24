import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import type { Recipe } from "@/types/recipe";

interface Props {
  recipe: Recipe;
}

export default function RecipePrintView({ recipe }: Props) {
  const qrValue = `rezept:${recipe.id}`;
  const printDate = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const diffLabel =
    recipe.difficulty === "simpel"
      ? "Simpel"
      : recipe.difficulty === "normal"
      ? "Normal"
      : "Schwer";

  return createPortal(
    <div className="print-only recipe-print-view">
      <style>{`
        @media print {
          body > *:not(.print-only) {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          @page {
            margin: 18mm 16mm 18mm 16mm;
            size: A4 portrait;
          }
        }
        .print-only {
          display: none;
        }
        .recipe-print-view {
          font-family: Georgia, "Times New Roman", serif;
          color: #1a1a0e;
          max-width: 800px;
          margin: 0 auto;
          background: #fff;
        }
        .print-header {
          border-bottom: 2.5px solid #4A7C59;
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .print-site-label {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #4A7C59;
          font-family: Arial, sans-serif;
          margin-bottom: 6px;
        }
        .print-title {
          font-size: 26px;
          font-weight: bold;
          color: #1a1a0e;
          margin: 0 0 4px 0;
          line-height: 1.2;
        }
        .print-category {
          font-size: 13px;
          color: #4A7C59;
          font-family: Arial, sans-serif;
        }
        .print-image {
          width: 100%;
          max-height: 220px;
          object-fit: cover;
          border-radius: 4px;
          margin-bottom: 18px;
          display: block;
        }
        .print-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          background: #f5f0e8;
          border: 1px solid #d4c9b0;
          border-radius: 6px;
          padding: 12px 16px;
          margin-bottom: 18px;
        }
        .print-meta-item {
          font-size: 12px;
          font-family: Arial, sans-serif;
          color: #3a3a2a;
        }
        .print-meta-label {
          font-weight: bold;
          color: #4A7C59;
          display: block;
          margin-bottom: 1px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .print-section-title {
          font-size: 16px;
          font-weight: bold;
          color: #4A7C59;
          border-bottom: 1px solid #c8d8c4;
          padding-bottom: 4px;
          margin: 18px 0 10px 0;
        }
        .print-ingredients {
          list-style: none;
          padding: 0;
          margin: 0;
          columns: 2;
          column-gap: 32px;
        }
        .print-ingredients li {
          font-size: 13px;
          padding: 3px 0;
          break-inside: avoid;
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-family: Arial, sans-serif;
        }
        .print-ing-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #C1693A;
          flex-shrink: 0;
          margin-top: 5px;
        }
        .print-steps {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .print-steps li {
          display: flex;
          gap: 12px;
          font-size: 13px;
          font-family: Arial, sans-serif;
          margin-bottom: 10px;
          line-height: 1.55;
          break-inside: avoid;
        }
        .print-step-num {
          flex-shrink: 0;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #4A7C59;
          color: #fff;
          font-size: 11px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Arial, sans-serif;
          margin-top: 1px;
        }
        .print-tips {
          background: #fdf8f0;
          border-left: 3px solid #C1693A;
          padding: 10px 14px;
          border-radius: 0 4px 4px 0;
          font-size: 13px;
          font-style: italic;
          color: #5c3b1c;
          line-height: 1.5;
          font-family: Arial, sans-serif;
          break-inside: avoid;
        }
        .print-tips-label {
          font-style: normal;
          font-weight: bold;
          color: #C1693A;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 4px;
          display: block;
        }
        .print-footer {
          margin-top: 28px;
          padding-top: 12px;
          border-top: 1px solid #c8d8c4;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
        }
        .print-footer-left {
          font-size: 11px;
          font-family: Arial, sans-serif;
          color: #888;
          line-height: 1.6;
        }
        .print-qr-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .print-qr-label {
          font-size: 11px;
          font-family: Arial, sans-serif;
          color: #4A7C59;
          font-weight: bold;
          letter-spacing: 0.04em;
          text-align: center;
        }
        .print-ingredients-block {
          page-break-inside: avoid;
        }
        .print-steps-block {
          page-break-inside: avoid;
        }
      `}</style>

      <div className="print-header">
        <div className="print-site-label">Lucia's Küche · Rezeptausdruck</div>
        <h1 className="print-title">{recipe.title}</h1>
        <div className="print-category">{recipe.category}</div>
      </div>

      {recipe.imageUrl && (
        <img
          className="print-image"
          src={recipe.imageUrl}
          alt={recipe.title}
        />
      )}

      <div className="print-meta">
        {recipe.prepTime && (
          <div className="print-meta-item">
            <span className="print-meta-label">Vorbereitung</span>
            {recipe.prepTime.replace("ca. ", "")}
          </div>
        )}
        {recipe.totalTime && recipe.totalTime !== recipe.prepTime && (
          <div className="print-meta-item">
            <span className="print-meta-label">Gesamt</span>
            {recipe.totalTime.replace("ca. ", "")}
          </div>
        )}
        <div className="print-meta-item">
          <span className="print-meta-label">Schwierigkeit</span>
          {diffLabel}
        </div>
        {recipe.servings && (
          <div className="print-meta-item">
            <span className="print-meta-label">Portionen</span>
            {recipe.servings}
          </div>
        )}
        {recipe.kcalPerPortion && (
          <div className="print-meta-item">
            <span className="print-meta-label">Kalorien</span>
            {recipe.kcalPerPortion} kcal/Portion
          </div>
        )}
        {recipe.rating && (
          <div className="print-meta-item">
            <span className="print-meta-label">Bewertung</span>
            {recipe.rating === "sehr lecker" ? "★★ Sehr lecker" : "★ Lecker"}
          </div>
        )}
        {recipe.source && (
          <div className="print-meta-item">
            <span className="print-meta-label">Quelle</span>
            {recipe.source}
          </div>
        )}
      </div>

      {recipe.notes && (
        <div className="print-tips">
          <span className="print-tips-label">Lucia's Tipps</span>
          {recipe.notes}
        </div>
      )}

      <div className="print-ingredients-block">
        <div className="print-section-title">
          Zutaten
          {recipe.servings ? ` (für ${recipe.servings} Personen)` : ""}
        </div>
        <ul className="print-ingredients">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>
              <span className="print-ing-dot" />
              <span>
                {[ing.amount, ing.unit].filter(Boolean).join(" ")}
                {(ing.amount || ing.unit) ? " " : ""}
                <strong>{ing.name}</strong>
                {ing.note && <span style={{ color: "#888" }}> ({ing.note})</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="print-steps-block">
        <div className="print-section-title">Zubereitung</div>
        <ol className="print-steps">
          {(recipe.steps as string[]).map((step, i) => (
            <li key={i}>
              <span className="print-step-num">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="print-footer">
        <div className="print-footer-left">
          <div>Ausgedruckt am {printDate}</div>
          <div>Lucia's Küche – persönliches Rezeptbuch</div>
          <div style={{ marginTop: "2px", wordBreak: "break-all" }}>
            {typeof window !== "undefined" ? window.location.origin + window.location.pathname : ""}
            {`#rezept-${recipe.id}`}
          </div>
        </div>
        <div className="print-qr-block">
          <QRCodeSVG
            value={qrValue}
            size={72}
            fgColor="#2d5240"
            bgColor="#ffffff"
            level="M"
          />
          <div className="print-qr-label">Rezept #{recipe.id}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

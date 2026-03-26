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

  const metaParts: string[] = [];
  if (recipe.prepTime) metaParts.push(`ca. ${recipe.prepTime.replace("ca. ", "")}`);
  else if (recipe.totalTime) metaParts.push(`ca. ${recipe.totalTime.replace("ca. ", "")}`);
  if (recipe.servings) metaParts.push(`${recipe.servings} Portionen`);
  metaParts.push(diffLabel);

  const currentUrl =
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname + `#rezept-${recipe.id}`
      : `#rezept-${recipe.id}`;

  const ratingCriteria = [
    "Geschmack",
    "Schwierigkeit",
    "Zeitaufwand",
    "Optik",
    "Würzung",
  ];

  return createPortal(
    <div className="print-only recipe-print-view">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');

        @media print {
          html, body {
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body > *:not(.print-only) {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          @page {
            margin: 18mm 16mm 18mm 16mm;
            size: A4 portrait;
            background: #fff;
          }
          .print-step-num {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
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
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }

        .print-content {
          flex: 1 1 auto;
        }

        /* ── Header ── */
        .print-header-top {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 4px;
        }
        .print-header-logo {
          font-family: 'Dancing Script', 'Brush Script MT', cursive;
          font-size: 38px;
          font-weight: 700;
          color: #1a1a0e;
          line-height: 1.1;
          margin: 0;
          letter-spacing: 0.01em;
        }
        .print-header-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          width: 100%;
          margin-top: 2px;
        }
        .print-header-category {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #3a3a2a;
        }
        .print-header-date {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          color: #666;
          letter-spacing: 0.04em;
        }
        .print-header-rule {
          border: none;
          border-top: 1.5px solid #1a1a0e;
          border-bottom: 1px solid #1a1a0e;
          height: 4px;
          background: transparent;
          margin: 0 0 12px 0;
        }
        .print-title {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 31px;
          font-weight: bold;
          color: #1a1a0e;
          margin: 12px 0 5px 0;
          line-height: 1.15;
        }
        .print-meta-line {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          font-style: italic;
          color: #555;
          margin-bottom: 14px;
        }

        /* ── Image ── */
        .print-image-wrap {
          position: relative;
          width: 100%;
          margin-bottom: 16px;
        }
        .print-image {
          width: 100%;
          max-height: 170px;
          object-fit: cover;
          border: 1px solid #ccc;
          border-radius: 0;
          display: block;
          margin-bottom: 0;
        }
        .print-ai-badge {
          position: absolute;
          bottom: 6px;
          right: 8px;
          background: rgba(0,0,0,0.55);
          color: #fff;
          font-size: 9px;
          font-family: Arial, Helvetica, sans-serif;
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 0.03em;
          pointer-events: none;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ── Two-column body ── */
        .print-body {
          display: flex;
          gap: 24px;
          align-items: flex-start;
        }
        .print-col-ingredients {
          flex: 0 0 38%;
          width: 38%;
        }
        .print-col-steps {
          flex: 1 1 62%;
          width: 62%;
        }

        /* ── Section titles ── */
        .print-section-title {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 14px;
          font-weight: bold;
          color: #1a1a0e;
          border-bottom: 1.5px solid #1a1a0e;
          padding-bottom: 3px;
          margin: 0 0 9px 0;
          letter-spacing: 0.02em;
        }

        /* ── Ingredients ── */
        .print-ingredients {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .print-ingredients li {
          font-size: 12px;
          padding: 2.5px 0;
          break-inside: avoid;
          display: flex;
          align-items: flex-start;
          gap: 5px;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.45;
        }
        .print-ing-dash {
          flex-shrink: 0;
          font-size: 11px;
          color: #555;
          margin-top: 1px;
          line-height: 1.45;
        }

        /* ── Steps ── */
        .print-steps {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .print-steps li {
          display: flex;
          gap: 10px;
          font-size: 12px;
          font-family: Arial, Helvetica, sans-serif;
          margin-bottom: 9px;
          line-height: 1.55;
          break-inside: avoid;
          align-items: flex-start;
        }
        .print-step-num {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4A7C59;
          color: #fff;
          font-size: 10px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Arial, Helvetica, sans-serif;
          margin-top: 2px;
        }

        /* ── Tips box ── */
        .print-tips {
          border-left: 3px solid #C1693A;
          padding: 8px 12px;
          background: transparent;
          font-size: 12px;
          font-style: italic;
          color: #3a3a2a;
          line-height: 1.5;
          font-family: Arial, Helvetica, sans-serif;
          break-inside: avoid;
          margin-bottom: 16px;
        }
        .print-tips-label {
          font-style: normal;
          font-weight: bold;
          color: #C1693A;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 3px;
          display: block;
        }

        /* ── Rating & Notes section ── */
        .print-rating-section {
          margin-top: 24px;
          border-top: 1.5px solid #1a1a0e;
          padding-top: 12px;
          display: flex;
          gap: 24px;
        }
        .print-rating-col {
          flex: 0 0 45%;
          width: 45%;
        }
        .print-notes-col {
          flex: 1 1 55%;
          width: 55%;
        }
        .print-rating-title {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 12px;
          font-weight: bold;
          color: #1a1a0e;
          margin: 0 0 8px 0;
          letter-spacing: 0.02em;
        }
        .print-rating-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
          gap: 8px;
        }
        .print-rating-label {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: #1a1a0e;
          flex-shrink: 0;
          min-width: 80px;
        }
        .print-rating-stars {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .print-star-box {
          width: 14px;
          height: 14px;
          border: 1px solid #1a1a0e;
          border-radius: 0;
          display: inline-block;
          font-size: 10px;
          line-height: 14px;
          text-align: center;
          color: #1a1a0e;
          font-family: Arial, Helvetica, sans-serif;
        }
        .print-notes-lines {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .print-notes-line {
          border-bottom: 1px solid #aaa;
          height: 22px;
          width: 100%;
        }

        /* ── Footer ── */
        .print-footer {
          margin-top: auto;
          padding-top: 8px;
          border-top: 1px solid #aaa;
          display: flex;
          align-items: flex-end;
          justify-content: flex-start;
          gap: 12px;
        }
        .print-qr-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }
        .print-qr-label {
          font-size: 10px;
          font-family: Arial, Helvetica, sans-serif;
          color: #888;
          letter-spacing: 0.03em;
          text-align: center;
        }
        .print-footer-url {
          font-size: 9px;
          font-family: Arial, Helvetica, sans-serif;
          color: #aaa;
          word-break: break-all;
          align-self: flex-end;
        }
      `}</style>

      {/* ── Main content (flex-grows to fill page) ── */}
      <div className="print-content">

      {/* ── Header ── */}
      <div>
        <div className="print-header-top">
          <div className="print-header-logo">Lucias Küche</div>
          <div className="print-header-meta-row">
            <span className="print-header-category">{recipe.category}</span>
            <span className="print-header-date">Gedruckt am {printDate}</span>
          </div>
        </div>
        <div className="print-header-rule" />
        <h1 className="print-title">{recipe.title}</h1>
        <div className="print-meta-line">{metaParts.join(" · ")}</div>
      </div>

      {/* ── Image ── */}
      {recipe.imageUrl && (
        <div className="print-image-wrap">
          <img
            className="print-image"
            src={recipe.imageUrl}
            alt={recipe.title}
          />
          {recipe.isAiGenerated && !recipe.mainPhotoUrl && (
            <span className="print-ai-badge">KI generiert</span>
          )}
        </div>
      )}

      {/* ── Tips (above columns, full width) ── */}
      {recipe.notes && (
        <div className="print-tips">
          <span className="print-tips-label">Lucia's Tipps</span>
          {recipe.notes}
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className="print-body">
        {/* Left: Ingredients */}
        <div className="print-col-ingredients">
          <div className="print-section-title">
            Zutaten{recipe.servings ? ` (${recipe.servings} Pers.)` : ""}
          </div>
          <ul className="print-ingredients">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                <span className="print-ing-dash">–</span>
                <span>
                  {ing.amount && <strong>{ing.amount}</strong>}
                  {ing.unit && <> {ing.unit}</>}
                  {(ing.amount || ing.unit) && <> </>}
                  {ing.name}
                  {ing.note && <span style={{ color: "#888" }}> ({ing.note})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: Steps */}
        <div className="print-col-steps">
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
      </div>

      {/* ── Rating & Notes section ── */}
      <div className="print-rating-section">
        {/* Left: Rating criteria */}
        <div className="print-rating-col">
          <div className="print-rating-title">Meine Bewertung</div>
          {ratingCriteria.map((label) => (
            <div key={label} className="print-rating-row">
              <span className="print-rating-label">{label}</span>
              <div className="print-rating-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className="print-star-box">☆</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right: Free notes with lines */}
        <div className="print-notes-col">
          <div className="print-rating-title">Meine Notizen</div>
          <div className="print-notes-lines">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="print-notes-line" />
            ))}
          </div>
        </div>
      </div>

      </div>{/* end print-content */}

      {/* ── Footer: QR code bottom left ── */}
      <div className="print-footer">
        <div className="print-qr-block">
          <QRCodeSVG
            value={qrValue}
            size={56}
            fgColor="#1a1a0e"
            bgColor="#ffffff"
            level="M"
          />
          <div className="print-qr-label">Rezept #{recipe.id}</div>
        </div>
        <div className="print-footer-url">{currentUrl}</div>
      </div>
    </div>,
    document.body
  );
}
